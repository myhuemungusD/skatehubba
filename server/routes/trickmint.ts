/**
 * TrickMint Routes
 *
 * Video upload pipeline for standalone trick clips.
 * Supports two upload flows:
 *
 * Flow A (Signed URLs):
 *   1. POST /request-upload → signed URL for direct-to-storage upload
 *   2. POST /confirm-upload → server validates file, creates DB record
 *
 * Flow B (Direct Firebase):
 *   1. Client uploads to Firebase Storage via client SDK
 *   2. POST /submit → server validates URL + metadata, creates DB record
 *
 * Both flows enforce file size limits, MIME validation, and duration caps.
 */

import { Router } from "express";
import { z } from "zod";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import { trickClips, usernames, customUsers } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import logger from "../logger";
import { generateUploadUrls, UPLOAD_LIMITS, isOwnStorageUrl } from "../services/storageService";
import {
  processUpload,
  confirmDirectUpload,
  VIDEO_LIMITS,
} from "../services/videoProcessingService";

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const requestUploadSchema = z.object({
  fileExtension: z.enum(["webm", "mp4", "mov"]).default("webm"),
});

const confirmUploadSchema = z.object({
  trickName: z.string().trim().min(1, "Trick name required").max(200),
  description: z.string().trim().max(1000).optional(),
  videoPath: z.string().min(1, "Video path required").max(500),
  thumbnailPath: z.string().max(500).optional(),
  videoDurationMs: z.number().int().min(0).max(VIDEO_LIMITS.MAX_VIDEO_DURATION_MS).optional(),
  spotId: z.number().int().positive().optional(),
  isPublic: z.boolean().default(true),
});

const submitDirectSchema = z.object({
  trickName: z.string().trim().min(1, "Trick name required").max(200),
  description: z.string().trim().max(1000).optional(),
  videoUrl: z.string().url().max(500),
  thumbnailUrl: z.string().url().max(500).optional(),
  videoDurationMs: z.number().int().min(0).max(VIDEO_LIMITS.MAX_VIDEO_DURATION_MS).optional(),
  fileSizeBytes: z.number().int().min(0).max(UPLOAD_LIMITS.MAX_VIDEO_SIZE_BYTES).optional(),
  mimeType: z.string().max(100).optional(),
  spotId: z.number().int().positive().optional(),
  isPublic: z.boolean().default(true),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================================
// Helpers
// ============================================================================

async function getUserDisplayName(db: ReturnType<typeof getDb>, userId: string): Promise<string> {
  const usernameResult = await db
    .select({ username: usernames.username })
    .from(usernames)
    .where(eq(usernames.uid, userId))
    .limit(1);

  if (usernameResult[0]?.username) {
    return usernameResult[0].username;
  }

  const userResult = await db
    .select({ firstName: customUsers.firstName })
    .from(customUsers)
    .where(eq(customUsers.id, userId))
    .limit(1);

  return userResult[0]?.firstName || "Skater";
}

// ============================================================================
// POST /api/trickmint/request-upload — Get signed upload URLs
// ============================================================================

router.post("/request-upload", authenticateUser, async (req, res) => {
  const parsed = requestUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const userId = req.currentUser!.id;

  try {
    const result = await generateUploadUrls(userId, parsed.data.fileExtension);

    logger.info("[TrickMint] Upload URLs generated", {
      userId,
      uploadId: result.uploadId,
    });

    res.json({
      uploadId: result.uploadId,
      videoUploadUrl: result.videoUploadUrl,
      thumbnailUploadUrl: result.thumbnailUploadUrl,
      videoPath: result.videoPath,
      thumbnailPath: result.thumbnailPath,
      expiresAt: result.expiresAt,
      limits: {
        maxVideoSizeBytes: UPLOAD_LIMITS.MAX_VIDEO_SIZE_BYTES,
        maxThumbnailSizeBytes: UPLOAD_LIMITS.MAX_THUMBNAIL_SIZE_BYTES,
        maxVideoDurationMs: VIDEO_LIMITS.MAX_VIDEO_DURATION_MS,
        allowedVideoTypes: UPLOAD_LIMITS.ALLOWED_VIDEO_MIME_TYPES,
        allowedThumbnailTypes: UPLOAD_LIMITS.ALLOWED_THUMBNAIL_MIME_TYPES,
      },
    });
  } catch (error) {
    logger.error("[TrickMint] Failed to generate upload URLs", { userId, error });
    res.status(500).json({ error: "Failed to generate upload URLs" });
  }
});

// ============================================================================
// POST /api/trickmint/confirm-upload — Validate signed URL upload, create record
// ============================================================================

router.post("/confirm-upload", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = confirmUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const userId = req.currentUser!.id;
  const { trickName, description, videoPath, thumbnailPath, videoDurationMs, spotId, isPublic } =
    parsed.data;

  // Ensure the path belongs to this user
  if (!videoPath.startsWith(`trickmint/${userId}/`)) {
    return res.status(403).json({ error: "Upload path does not belong to you" });
  }

  try {
    const db = getDb();
    const userName = await getUserDisplayName(db, userId);

    const result = await processUpload({
      userId,
      userName,
      trickName,
      description,
      videoPath,
      thumbnailPath,
      videoDurationMs,
      spotId,
      isPublic,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    logger.info("[TrickMint] Upload confirmed", {
      clipId: result.clip!.id,
      userId,
      trickName,
    });

    res.status(201).json({ clip: result.clip });
  } catch (error) {
    logger.error("[TrickMint] Confirm upload failed", { userId, error });
    res.status(500).json({ error: "Failed to confirm upload" });
  }
});

// ============================================================================
// POST /api/trickmint/submit — Direct Firebase upload flow (client SDK upload)
// ============================================================================

router.post("/submit", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = submitDirectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const userId = req.currentUser!.id;
  const {
    trickName,
    description,
    videoUrl,
    thumbnailUrl,
    videoDurationMs,
    fileSizeBytes,
    mimeType,
    spotId,
    isPublic,
  } = parsed.data;

  try {
    const db = getDb();
    const userName = await getUserDisplayName(db, userId);

    const result = await confirmDirectUpload({
      userId,
      userName,
      trickName,
      description,
      videoUrl,
      thumbnailUrl,
      videoDurationMs,
      fileSizeBytes,
      mimeType,
      spotId,
      isPublic,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    logger.info("[TrickMint] Direct upload submitted", {
      clipId: result.clip!.id,
      userId,
      trickName,
    });

    res.status(201).json({ clip: result.clip });
  } catch (error) {
    logger.error("[TrickMint] Direct submit failed", { userId, error });
    res.status(500).json({ error: "Failed to submit clip" });
  }
});

// ============================================================================
// GET /api/trickmint/my-clips — List authenticated user's clips
// ============================================================================

router.get("/my-clips", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid pagination" });
  }

  const userId = req.currentUser!.id;
  const { limit, offset } = parsed.data;

  try {
    const db = getDb();

    const clips = await db
      .select()
      .from(trickClips)
      .where(eq(trickClips.userId, userId))
      .orderBy(desc(trickClips.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(trickClips)
      .where(eq(trickClips.userId, userId));

    res.json({
      clips,
      total: countResult?.total || 0,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("[TrickMint] Failed to fetch user clips", { userId, error });
    res.status(500).json({ error: "Failed to fetch clips" });
  }
});

// ============================================================================
// GET /api/trickmint/feed — Public feed of ready clips
// ============================================================================

router.get("/feed", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid pagination" });
  }

  const { limit, offset } = parsed.data;

  try {
    const db = getDb();

    const clips = await db
      .select()
      .from(trickClips)
      .where(and(eq(trickClips.isPublic, true), eq(trickClips.status, "ready")))
      .orderBy(desc(trickClips.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(trickClips)
      .where(and(eq(trickClips.isPublic, true), eq(trickClips.status, "ready")));

    res.json({
      clips,
      total: countResult?.total || 0,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("[TrickMint] Failed to fetch feed", { error });
    res.status(500).json({ error: "Failed to fetch feed" });
  }
});

// ============================================================================
// GET /api/trickmint/:id — Single clip detail
// ============================================================================

router.get("/:id", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const clipId = parseInt(req.params.id, 10);
  if (isNaN(clipId)) {
    return res.status(400).json({ error: "Invalid clip ID" });
  }

  try {
    const db = getDb();

    const [clip] = await db.select().from(trickClips).where(eq(trickClips.id, clipId)).limit(1);

    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }

    // Non-public clips are only visible to the owner
    if (!clip.isPublic && clip.userId !== req.currentUser!.id) {
      return res.status(404).json({ error: "Clip not found" });
    }

    // Increment views (fire-and-forget)
    db.update(trickClips)
      .set({ views: sql`${trickClips.views} + 1` })
      .where(eq(trickClips.id, clipId))
      .then(() => {})
      .catch(() => {});

    res.json({ clip });
  } catch (error) {
    logger.error("[TrickMint] Failed to fetch clip", { clipId, error });
    res.status(500).json({ error: "Failed to fetch clip" });
  }
});

// ============================================================================
// DELETE /api/trickmint/:id — Delete own clip
// ============================================================================

router.delete("/:id", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const clipId = parseInt(req.params.id, 10);
  if (isNaN(clipId)) {
    return res.status(400).json({ error: "Invalid clip ID" });
  }

  const userId = req.currentUser!.id;

  try {
    const db = getDb();

    const [clip] = await db.select().from(trickClips).where(eq(trickClips.id, clipId)).limit(1);

    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }

    if (clip.userId !== userId) {
      return res.status(403).json({ error: "You can only delete your own clips" });
    }

    await db.delete(trickClips).where(eq(trickClips.id, clipId));

    logger.info("[TrickMint] Clip deleted", { clipId, userId });

    res.json({ message: "Clip deleted." });
  } catch (error) {
    logger.error("[TrickMint] Failed to delete clip", { clipId, userId, error });
    res.status(500).json({ error: "Failed to delete clip" });
  }
});

// ============================================================================
// GET /api/trickmint/limits — Public limits info for client validation
// ============================================================================

router.get("/upload/limits", async (_req, res) => {
  res.json({
    maxVideoSizeBytes: UPLOAD_LIMITS.MAX_VIDEO_SIZE_BYTES,
    maxThumbnailSizeBytes: UPLOAD_LIMITS.MAX_THUMBNAIL_SIZE_BYTES,
    maxVideoDurationMs: VIDEO_LIMITS.MAX_VIDEO_DURATION_MS,
    allowedVideoTypes: [...UPLOAD_LIMITS.ALLOWED_VIDEO_MIME_TYPES],
    allowedThumbnailTypes: [...UPLOAD_LIMITS.ALLOWED_THUMBNAIL_MIME_TYPES],
  });
});

export { router as trickmintRouter };
