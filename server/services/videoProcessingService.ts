/**
 * Video Processing Service
 *
 * Handles server-side video validation, metadata extraction, and
 * processing status management for the TrickMint pipeline.
 *
 * Current implementation: validation-only (no server-side transcoding).
 * Transcoding can be added via Mux, Cloudflare Stream, or ffmpeg workers
 * by extending the processUpload function.
 */

import { getDb } from "../db";
import { trickClips } from "@shared/schema";
import { eq } from "drizzle-orm";
import { validateUploadedFile, getPublicUrl } from "./storageService";
import logger from "../logger";

// ============================================================================
// Constants
// ============================================================================

const MAX_VIDEO_DURATION_MS = 30_000; // 30 seconds for TrickMint (more generous than game's 15s)
const MIN_VIDEO_DURATION_MS = 500; // At least 0.5 seconds

// ============================================================================
// Types
// ============================================================================

export interface ProcessUploadInput {
  userId: string;
  userName: string;
  trickName: string;
  description?: string;
  videoPath: string;
  thumbnailPath?: string;
  videoDurationMs?: number;
  spotId?: number;
  gameId?: string;
  gameTurnId?: number;
  isPublic?: boolean;
}

export interface ProcessUploadResult {
  success: boolean;
  clip?: {
    id: number;
    videoUrl: string;
    thumbnailUrl: string | null;
    status: string;
  };
  error?: string;
}

// ============================================================================
// Core Processing
// ============================================================================

/**
 * Process and validate an uploaded video, then create the trick_clips record.
 *
 * Flow:
 * 1. Validate video file exists in storage and meets constraints
 * 2. Validate thumbnail if provided
 * 3. Check duration constraints
 * 4. Create DB record with status "ready" (or "processing" for future transcoding)
 */
export async function processUpload(input: ProcessUploadInput): Promise<ProcessUploadResult> {
  const {
    userId,
    userName,
    trickName,
    description,
    videoPath,
    thumbnailPath,
    videoDurationMs,
    spotId,
    gameId,
    gameTurnId,
    isPublic = true,
  } = input;

  // Step 1: Validate video file
  const videoValidation = await validateUploadedFile(videoPath, "video");
  if (!videoValidation.valid) {
    logger.warn("[VideoProcessing] Video validation failed", {
      userId,
      videoPath,
      error: videoValidation.error,
    });
    return { success: false, error: videoValidation.error };
  }

  // Step 2: Validate thumbnail if provided
  let thumbnailUrl: string | null = null;
  if (thumbnailPath) {
    const thumbValidation = await validateUploadedFile(thumbnailPath, "thumbnail");
    if (thumbValidation.valid) {
      thumbnailUrl = getPublicUrl(thumbnailPath);
    } else {
      // Thumbnail validation failure is non-fatal — proceed without thumbnail
      logger.warn("[VideoProcessing] Thumbnail validation failed, continuing without", {
        userId,
        thumbnailPath,
        error: thumbValidation.error,
      });
    }
  }

  // Step 3: Validate duration
  if (videoDurationMs !== undefined) {
    if (videoDurationMs > MAX_VIDEO_DURATION_MS) {
      return {
        success: false,
        error: `Video exceeds maximum duration of ${MAX_VIDEO_DURATION_MS / 1000}s`,
      };
    }
    if (videoDurationMs < MIN_VIDEO_DURATION_MS) {
      return {
        success: false,
        error: "Video is too short",
      };
    }
  }

  // Step 4: Create DB record
  try {
    const db = getDb();
    const videoUrl = getPublicUrl(videoPath);

    const [clip] = await db
      .insert(trickClips)
      .values({
        userId,
        userName,
        trickName: trickName.trim(),
        description: description?.trim() || null,
        videoUrl,
        videoDurationMs: videoDurationMs ?? null,
        thumbnailUrl,
        fileSizeBytes: videoValidation.metadata?.size ?? null,
        mimeType: videoValidation.metadata?.contentType ?? null,
        status: "ready", // Directly ready since no transcoding yet
        spotId: spotId ?? null,
        gameId: gameId ?? null,
        gameTurnId: gameTurnId ?? null,
        isPublic,
      })
      .returning();

    logger.info("[VideoProcessing] Clip created", {
      clipId: clip.id,
      userId,
      trickName,
      fileSize: videoValidation.metadata?.size,
    });

    return {
      success: true,
      clip: {
        id: clip.id,
        videoUrl: clip.videoUrl,
        thumbnailUrl: clip.thumbnailUrl,
        status: clip.status,
      },
    };
  } catch (error) {
    logger.error("[VideoProcessing] Failed to create clip record", { userId, error });
    return { success: false, error: "Failed to save clip" };
  }
}

/**
 * Confirm a video uploaded directly via Firebase client SDK.
 * Used when the client uploads to Firebase Storage directly (game flow)
 * and then sends the URL to the server for validation and persistence.
 */
export async function confirmDirectUpload(input: {
  userId: string;
  userName: string;
  trickName: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  videoDurationMs?: number;
  fileSizeBytes?: number;
  mimeType?: string;
  spotId?: number;
  gameId?: string;
  gameTurnId?: number;
  isPublic?: boolean;
}): Promise<ProcessUploadResult> {
  const {
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
    gameId,
    gameTurnId,
    isPublic = true,
  } = input;

  // Validate duration
  if (videoDurationMs !== undefined && videoDurationMs > MAX_VIDEO_DURATION_MS) {
    return {
      success: false,
      error: `Video exceeds maximum duration of ${MAX_VIDEO_DURATION_MS / 1000}s`,
    };
  }

  // Validate file size if provided
  if (fileSizeBytes !== undefined && fileSizeBytes > 50 * 1024 * 1024) {
    return { success: false, error: "Video exceeds 50MB size limit" };
  }

  try {
    const db = getDb();

    const [clip] = await db
      .insert(trickClips)
      .values({
        userId,
        userName,
        trickName: trickName.trim(),
        description: description?.trim() || null,
        videoUrl,
        videoDurationMs: videoDurationMs ?? null,
        thumbnailUrl: thumbnailUrl ?? null,
        fileSizeBytes: fileSizeBytes ?? null,
        mimeType: mimeType ?? null,
        status: "ready",
        spotId: spotId ?? null,
        gameId: gameId ?? null,
        gameTurnId: gameTurnId ?? null,
        isPublic,
      })
      .returning();

    logger.info("[VideoProcessing] Direct upload clip created", {
      clipId: clip.id,
      userId,
      trickName,
    });

    return {
      success: true,
      clip: {
        id: clip.id,
        videoUrl: clip.videoUrl,
        thumbnailUrl: clip.thumbnailUrl,
        status: clip.status,
      },
    };
  } catch (error) {
    logger.error("[VideoProcessing] Failed to create direct upload clip", { userId, error });
    return { success: false, error: "Failed to save clip" };
  }
}

/**
 * Mark a clip as failed (e.g., after transcoding failure).
 */
export async function markClipFailed(clipId: number, reason: string): Promise<void> {
  try {
    const db = getDb();
    await db
      .update(trickClips)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(trickClips.id, clipId));
    logger.info("[VideoProcessing] Clip marked as failed", { clipId, reason });
  } catch (error) {
    logger.error("[VideoProcessing] Failed to mark clip as failed", { clipId, error });
  }
}

export const VIDEO_LIMITS = {
  MAX_VIDEO_DURATION_MS,
  MIN_VIDEO_DURATION_MS,
} as const;
