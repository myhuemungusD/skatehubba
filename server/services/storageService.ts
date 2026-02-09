/**
 * Storage Service
 *
 * Abstracts Firebase Cloud Storage operations for the video upload pipeline.
 * Provides signed upload URLs, file validation, and metadata retrieval.
 */

import { admin } from "../admin";
import { env } from "../config/env";
import logger from "../logger";
import crypto from "node:crypto";

// ============================================================================
// Constants
// ============================================================================

const SIGNED_URL_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_THUMBNAIL_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_VIDEO_MIME_TYPES = [
  "video/webm",
  "video/mp4",
  "video/quicktime", // .mov
] as const;

const ALLOWED_THUMBNAIL_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedVideoMime = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];
export type AllowedThumbnailMime = (typeof ALLOWED_THUMBNAIL_MIME_TYPES)[number];

// ============================================================================
// Helpers
// ============================================================================

function getBucket() {
  const bucketName = env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("FIREBASE_STORAGE_BUCKET is not configured");
  }
  return admin.storage().bucket(bucketName);
}

function generateUploadId(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ============================================================================
// Public API
// ============================================================================

export interface UploadUrlResult {
  uploadId: string;
  videoUploadUrl: string;
  thumbnailUploadUrl: string;
  videoPath: string;
  thumbnailPath: string;
  expiresAt: string;
}

/**
 * Generate signed upload URLs for video and thumbnail.
 * The client uploads directly to Cloud Storage using these URLs.
 */
export async function generateUploadUrls(
  userId: string,
  fileExtension: string = "webm"
): Promise<UploadUrlResult> {
  const bucket = getBucket();
  const uploadId = generateUploadId();
  const timestamp = Date.now();

  const videoPath = `trickmint/${userId}/${uploadId}_${timestamp}.${fileExtension}`;
  const thumbnailPath = `trickmint/${userId}/${uploadId}_${timestamp}_thumb.jpg`;

  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_MS);

  const [videoUploadUrl] = await bucket.file(videoPath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresAt,
    contentType: fileExtension === "mp4" ? "video/mp4" : "video/webm",
  });

  const [thumbnailUploadUrl] = await bucket.file(thumbnailPath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresAt,
    contentType: "image/jpeg",
  });

  return {
    uploadId,
    videoUploadUrl,
    thumbnailUploadUrl,
    videoPath,
    thumbnailPath,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Generate a signed download URL for a stored file.
 */
export async function getSignedDownloadUrl(filePath: string): Promise<string> {
  const bucket = getBucket();
  const [url] = await bucket.file(filePath).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  return url;
}

export interface FileMetadata {
  size: number;
  contentType: string;
  exists: boolean;
}

/**
 * Validate that an uploaded file exists and meets constraints.
 */
export async function validateUploadedFile(
  filePath: string,
  type: "video" | "thumbnail"
): Promise<{ valid: boolean; error?: string; metadata?: FileMetadata }> {
  try {
    const bucket = getBucket();
    const file = bucket.file(filePath);
    const [exists] = await file.exists();

    if (!exists) {
      return { valid: false, error: "File not found in storage" };
    }

    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size || 0);
    const contentType = String(metadata.contentType || "");

    const maxSize = type === "video" ? MAX_VIDEO_SIZE_BYTES : MAX_THUMBNAIL_SIZE_BYTES;
    const allowedTypes = type === "video" ? ALLOWED_VIDEO_MIME_TYPES : ALLOWED_THUMBNAIL_MIME_TYPES;

    if (size > maxSize) {
      return {
        valid: false,
        error: `File exceeds maximum size of ${maxSize / (1024 * 1024)}MB (got ${(size / (1024 * 1024)).toFixed(1)}MB)`,
      };
    }

    if (!(allowedTypes as readonly string[]).includes(contentType)) {
      return {
        valid: false,
        error: `Invalid file type: ${contentType}. Allowed: ${allowedTypes.join(", ")}`,
      };
    }

    return {
      valid: true,
      metadata: { size, contentType, exists: true },
    };
  } catch (error) {
    logger.error("[Storage] File validation failed", { filePath, error });
    return { valid: false, error: "Failed to validate file" };
  }
}

/**
 * Get a public download URL for a Firebase Storage file.
 * Uses the standard Firebase Storage download URL format.
 */
export function getPublicUrl(filePath: string): string {
  const bucketName = env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("FIREBASE_STORAGE_BUCKET is not configured");
  }
  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`;
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    const bucket = getBucket();
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (exists) {
      await file.delete();
    }
  } catch (error) {
    logger.error("[Storage] Failed to delete file", { filePath, error });
  }
}

/**
 * Validate that a video URL belongs to our Firebase Storage bucket.
 * Prevents storing arbitrary external URLs.
 */
export function isOwnStorageUrl(url: string): boolean {
  const bucketName = env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return false;

  return (
    url.includes(`firebasestorage.googleapis.com/v0/b/${bucketName}`) ||
    url.includes(`storage.googleapis.com/${bucketName}`)
  );
}

export const UPLOAD_LIMITS = {
  MAX_VIDEO_SIZE_BYTES,
  MAX_THUMBNAIL_SIZE_BYTES,
  ALLOWED_VIDEO_MIME_TYPES,
  ALLOWED_THUMBNAIL_MIME_TYPES,
  SIGNED_URL_EXPIRY_MS,
} as const;
