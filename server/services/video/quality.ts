/**
 * Video Transcoding — Quality Presets & Constants
 *
 * Quality tiers tuned for short skate clips (15-30s).
 * "low" is served to Save-Data clients, "medium" is the default,
 * "high" preserves near-original quality for detail-focused viewing.
 */

import type { QualityTier, QualityPreset, TranscodeOptions } from "./types";

/**
 * Quality presets tuned for short skate clips (15-30s).
 * "low" is served to Save-Data clients, "medium" is the default,
 * "high" preserves near-original quality for detail-focused viewing.
 */
export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  low: { maxWidth: 480, maxHeight: 854, targetBitrate: "500k", audioBitrate: "64k" },
  medium: { maxWidth: 720, maxHeight: 1280, targetBitrate: "1200k", audioBitrate: "96k" },
  high: { maxWidth: 1080, maxHeight: 1920, targetBitrate: "2500k", audioBitrate: "128k" },
};

export const DEFAULT_QUALITY: QualityTier = "medium";

export const DEFAULT_OPTIONS: Required<Omit<TranscodeOptions, "audioBitrate">> = {
  maxDurationMs: 30_000,
  maxWidth: 1080,
  maxHeight: 1920,
  targetBitrate: "1200k", // Default lowered from 2M — medium tier is the new default
  audioEnabled: true,
};

export const FFPROBE_TIMEOUT_MS = 15_000;
export const FFMPEG_TIMEOUT_MS = 120_000;
