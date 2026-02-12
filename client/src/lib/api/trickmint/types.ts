/**
 * TrickMint API Types
 *
 * Types for the video upload pipeline.
 */

export interface TrickClip {
  id: number;
  userId: string;
  userName: string;
  trickName: string;
  description: string | null;
  videoUrl: string;
  /** Bandwidth-optimized URL chosen by the server based on Save-Data / ECT headers */
  videoUrlForQuality?: string;
  /** Quality tier the server selected (low/medium/high) */
  preferredQuality?: "low" | "medium" | "high";
  videoDurationMs: number | null;
  thumbnailUrl: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  status: "processing" | "ready" | "failed" | "flagged";
  spotId: number | null;
  gameId: string | null;
  gameTurnId: number | null;
  views: number;
  likes: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadUrlResponse {
  uploadId: string;
  videoUploadUrl: string;
  thumbnailUploadUrl: string;
  videoPath: string;
  thumbnailPath: string;
  expiresAt: string;
  limits: UploadLimits;
}

export interface UploadLimits {
  maxVideoSizeBytes: number;
  maxThumbnailSizeBytes: number;
  maxVideoDurationMs: number;
  allowedVideoTypes: string[];
  allowedThumbnailTypes: string[];
}

export interface ConfirmUploadRequest {
  trickName: string;
  description?: string;
  videoPath: string;
  thumbnailPath?: string;
  videoDurationMs?: number;
  spotId?: number;
  isPublic?: boolean;
}

export interface SubmitDirectRequest {
  trickName: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  videoDurationMs?: number;
  fileSizeBytes?: number;
  mimeType?: string;
  spotId?: number;
  isPublic?: boolean;
}

export interface ClipResponse {
  clip: {
    id: number;
    videoUrl: string;
    thumbnailUrl: string | null;
    status: string;
  };
}

export interface ClipListResponse {
  clips: TrickClip[];
  total: number;
  limit: number;
  offset: number;
}
