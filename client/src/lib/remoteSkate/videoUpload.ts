/**
 * Video Upload Service for Remote S.K.A.T.E.
 *
 * Handles client-side validation (size, type, duration) and
 * resumable upload to Firebase Storage with progress tracking.
 *
 * @module lib/remoteSkate/videoUpload
 */

import { ref, uploadBytesResumable, getDownloadURL, type UploadTask } from "firebase/storage";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "../firebase";
import { logger } from "../logger";

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DURATION_MS = 60_000; // 60 seconds
const ALLOWED_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

// =============================================================================
// TYPES
// =============================================================================

export interface VideoUploadParams {
  file: File;
  uid: string;
  gameId: string;
  roundId: string;
  videoId: string;
  role: "set" | "reply";
}

export interface VideoUploadCallbacks {
  onProgress?: (percent: number) => void;
  onComplete?: (downloadURL: string) => void;
  onError?: (error: Error) => void;
}

export interface VideoValidationResult {
  valid: boolean;
  error?: string;
  durationMs?: number;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate file type against allowed MIME types.
 */
function validateFileType(file: File): VideoValidationResult {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type || "unknown"}. Allowed: MP4, MOV, WebM.`,
    };
  }
  return { valid: true };
}

/**
 * Validate file size against 100MB limit.
 */
function validateFileSize(file: File): VideoValidationResult {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File too large (${sizeMB} MB). Maximum size is 100 MB.`,
    };
  }
  if (file.size === 0) {
    return { valid: false, error: "File is empty." };
  }
  return { valid: true };
}

/**
 * Read video duration using an HTMLVideoElement.
 * Returns duration in milliseconds, or rejects if duration cannot be read.
 */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    const cleanup = () => {
      URL.revokeObjectURL(video.src);
      video.remove();
    };

    video.onloadedmetadata = () => {
      const durationMs = Math.round(video.duration * 1000);
      cleanup();

      if (!isFinite(video.duration) || video.duration <= 0) {
        reject(new Error("Could not determine video duration. Please try a different file."));
        return;
      }
      resolve(durationMs);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read video metadata. The file may be corrupt or unsupported."));
    };

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out reading video duration. Please try a different file."));
    }, 10_000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const durationMs = Math.round(video.duration * 1000);
      cleanup();

      if (!isFinite(video.duration) || video.duration <= 0) {
        reject(new Error("Could not determine video duration. Please try a different file."));
        return;
      }
      resolve(durationMs);
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Full client-side validation: type, size, duration.
 * All checks run BEFORE any network request.
 */
export async function validateVideo(file: File): Promise<VideoValidationResult> {
  // 1. Type check
  const typeResult = validateFileType(file);
  if (!typeResult.valid) return typeResult;

  // 2. Size check
  const sizeResult = validateFileSize(file);
  if (!sizeResult.valid) return sizeResult;

  // 3. Duration check
  try {
    const durationMs = await readVideoDuration(file);
    if (durationMs > MAX_DURATION_MS) {
      const durationSec = (durationMs / 1000).toFixed(1);
      return {
        valid: false,
        error: `Video too long (${durationSec}s). Maximum duration is 60 seconds.`,
      };
    }
    return { valid: true, durationMs };
  } catch (err) {
    // Fail closed: if we can't read duration, reject the file
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Could not validate video duration.",
    };
  }
}

// =============================================================================
// UPLOAD
// =============================================================================

/**
 * Get file extension from MIME type.
 */
function getExtension(contentType: string): string {
  switch (contentType) {
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    case "video/webm":
      return "webm";
    default:
      return "mp4";
  }
}

/**
 * Upload a video to Firebase Storage with resumable upload and progress tracking.
 *
 * Flow:
 * 1. Creates videos/{videoId} Firestore doc with status="uploading"
 * 2. Uploads file to videos/{uid}/{gameId}/{roundId}/{videoId}.{ext}
 * 3. On success: updates video doc + patches round doc
 * 4. On failure: updates video doc with error
 *
 * Returns the UploadTask for cancellation support.
 */
export function uploadVideo(
  params: VideoUploadParams,
  durationMs: number,
  callbacks: VideoUploadCallbacks = {}
): UploadTask {
  const { file, uid, gameId, roundId, videoId, role } = params;
  const ext = getExtension(file.type);
  const storagePath = `videos/${uid}/${gameId}/${roundId}/${videoId}.${ext}`;

  // Create video doc immediately with status="uploading"
  const videoDocRef = doc(db, "videos", videoId);
  setDoc(videoDocRef, {
    createdAt: serverTimestamp(),
    uid,
    gameId,
    roundId,
    role,
    storagePath,
    downloadURL: null,
    contentType: file.type,
    sizeBytes: file.size,
    durationMs,
    status: "uploading",
    errorCode: null,
    errorMessage: null,
  }).catch((err) => {
    logger.error("[VideoUpload] Failed to create video doc", err);
  });

  // Start resumable upload
  const storageRef = ref(storage, storagePath);
  const metadata = {
    contentType: file.type,
    customMetadata: {
      uid,
      gameId,
      roundId,
      videoId,
      role,
      contentType: file.type,
      durationMs: String(durationMs),
    },
  };

  const uploadTask = uploadBytesResumable(storageRef, file, metadata);

  uploadTask.on(
    "state_changed",
    // Progress
    (snapshot) => {
      const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      callbacks.onProgress?.(percent);
    },
    // Error
    async (error) => {
      logger.error("[VideoUpload] Upload failed", error);

      // Update video doc with failure
      try {
        await updateDoc(videoDocRef, {
          status: "failed",
          errorCode: error.code || "unknown",
          errorMessage: error.message || "Upload failed",
        });
      } catch (docErr) {
        logger.error("[VideoUpload] Failed to update video doc on error", docErr);
      }

      callbacks.onError?.(error);
    },
    // Success
    async () => {
      try {
        const downloadURL = await getDownloadURL(storageRef);

        // Update video doc: status="ready"
        await updateDoc(videoDocRef, {
          status: "ready",
          downloadURL,
        });

        // Patch round doc with video reference
        const roundDocRef = doc(db, "games", gameId, "rounds", roundId);
        const roundUpdate = role === "set" ? { setVideoId: videoId } : { replyVideoId: videoId };
        await updateDoc(roundDocRef, roundUpdate);

        logger.info("[VideoUpload] Upload complete", { videoId, downloadURL });
        callbacks.onComplete?.(downloadURL);
      } catch (err) {
        logger.error("[VideoUpload] Post-upload processing failed", err);

        try {
          await updateDoc(videoDocRef, {
            status: "failed",
            errorCode: "post_upload_error",
            errorMessage: err instanceof Error ? err.message : "Post-upload processing failed",
          });
        } catch (docErr) {
          logger.error("[VideoUpload] Failed to update video doc after post-upload error", docErr);
        }

        callbacks.onError?.(
          err instanceof Error ? err : new Error("Post-upload processing failed")
        );
      }
    }
  );

  return uploadTask;
}
