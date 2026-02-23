/**
 * Shared Validation Utilities
 *
 * Reusable validation patterns for Cloud Functions.
 */

/**
 * Regex for valid Firebase Storage video paths.
 * Format: videos/{uid}/{gameId}/round_{roundId}/{filename}.{ext}
 *
 * Rejects path traversal (..), null bytes, and malformed paths.
 * Used by both submitTrick (input validation) and getVideoUrl (authorization).
 */
export const STORAGE_PATH_RE =
  /^videos\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/round_[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.\w+$/;
