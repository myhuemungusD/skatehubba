/**
 * Video Transcoding — Multi-Quality Renditions
 *
 * Transcodes an input video into multiple quality tiers.
 * Only generates renditions that are smaller than the source resolution.
 */

import { join } from "node:path";
import logger from "../../logger";
import { probeVideo } from "./ffprobe";
import { transcodeVideo, generateThumbnail } from "./ffmpeg";
import { QUALITY_PRESETS, DEFAULT_OPTIONS } from "./quality";
import type { MultiQualityResult, QualityTier, TranscodeOptions } from "./types";

/**
 * Transcode an input video into multiple quality renditions.
 * Only generates renditions that are smaller than the source resolution.
 * Returns paths keyed by quality tier for upload to storage.
 */
export async function transcodeMultiQuality(
  inputPath: string,
  workDir: string,
  options: { maxDurationMs?: number; tiers?: QualityTier[] } = {}
): Promise<MultiQualityResult> {
  const tiers = options.tiers ?? (["low", "medium"] as QualityTier[]);
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_OPTIONS.maxDurationMs;

  // Probe source to skip renditions larger than original
  const sourceProbe = await probeVideo(inputPath);
  if (sourceProbe.isCorrupt) {
    return { success: false, outputs: {}, error: "Source video is corrupt" };
  }

  const outputs: MultiQualityResult["outputs"] = {};
  const errors: string[] = [];

  for (const tier of tiers) {
    const preset = QUALITY_PRESETS[tier];

    // Skip if source is already smaller than this tier
    if (sourceProbe.width <= preset.maxWidth && sourceProbe.height <= preset.maxHeight) {
      // Source fits within this tier's bounds — just use source directly for this tier
      outputs[tier] = { path: inputPath, probe: sourceProbe };
      continue;
    }

    const outputPath = join(workDir, `${tier}.mp4`);
    const result = await transcodeVideo(inputPath, outputPath, {
      maxDurationMs: maxDurationMs / 1000 > 0 ? maxDurationMs : DEFAULT_OPTIONS.maxDurationMs,
      maxWidth: preset.maxWidth,
      maxHeight: preset.maxHeight,
      targetBitrate: preset.targetBitrate,
      audioEnabled: true,
      audioBitrate: preset.audioBitrate,
    } as TranscodeOptions);

    if (result.success) {
      const probe = await probeVideo(outputPath);
      outputs[tier] = { path: outputPath, probe };
    } else {
      errors.push(`${tier}: ${result.error}`);
      logger.warn("[Transcoder] Quality tier failed", { tier, error: result.error });
    }
  }

  // Generate thumbnail from best available rendition
  const bestTier = tiers.find((t) => outputs[t]) ?? Object.keys(outputs)[0];
  let thumbnailPath: string | undefined;
  if (bestTier && outputs[bestTier as QualityTier]) {
    const thumbOutput = join(workDir, "thumb.jpg");
    const thumbResult = await generateThumbnail(
      outputs[bestTier as QualityTier]!.path,
      thumbOutput
    );
    if (thumbResult.success) {
      thumbnailPath = thumbOutput;
    }
  }

  const hasAnyOutput = Object.keys(outputs).length > 0;
  return {
    success: hasAnyOutput,
    outputs,
    thumbnailPath,
    error: hasAnyOutput ? undefined : errors.join("; "),
  };
}
