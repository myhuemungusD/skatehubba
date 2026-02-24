/**
 * Video Transcoding — Type Definitions
 *
 * Shared interfaces and type aliases for the video processing pipeline.
 */

export interface ProbeResult {
  durationMs: number;
  width: number;
  height: number;
  codec: string;
  audioCodec: string | null;
  fps: number;
  bitrate: number;
  fileSize: number;
  hasAudio: boolean;
  isCorrupt: boolean;
  errors: string[];
}

export interface TranscodeOptions {
  maxDurationMs?: number;
  maxWidth?: number;
  maxHeight?: number;
  targetBitrate?: string;
  audioEnabled?: boolean;
  /** Per-rendition audio bitrate (used by multi-quality path) */
  audioBitrate?: string;
}

export interface TranscodeResult {
  success: boolean;
  outputPath?: string;
  thumbnailPath?: string;
  probe?: ProbeResult;
  error?: string;
}

export type QualityTier = "low" | "medium" | "high";

export interface QualityPreset {
  maxWidth: number;
  maxHeight: number;
  targetBitrate: string;
  audioBitrate: string;
}

export interface MultiQualityResult {
  success: boolean;
  outputs: Partial<Record<QualityTier, { path: string; probe: ProbeResult }>>;
  thumbnailPath?: string;
  error?: string;
}
