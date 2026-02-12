/**
 * Video Transcoding Service
 *
 * Provides server-side video validation via ffprobe, transcoding to
 * standardised format (H.264/AAC MP4), and thumbnail generation.
 *
 * Prerequisites: ffmpeg and ffprobe must be installed on the host.
 *
 * Architecture:
 *   1. probeVideo()     — extract real duration, codec, resolution via ffprobe
 *   2. transcodeVideo() — normalise to H.264 MP4 with size limits
 *   3. generateThumbnail() — extract first frame as JPEG thumbnail
 *   4. processVideoJob() — orchestrates probe → transcode → thumbnail → DB update
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import logger from "../logger";
import { getDb } from "../db";
import { trickClips } from "@shared/schema";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

// ============================================================================
// Types
// ============================================================================

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
}

export interface TranscodeResult {
  success: boolean;
  outputPath?: string;
  thumbnailPath?: string;
  probe?: ProbeResult;
  error?: string;
}

// ============================================================================
// Quality Tiers — reduce egress by serving smaller renditions by default
// ============================================================================

export type QualityTier = "low" | "medium" | "high";

export interface QualityPreset {
  maxWidth: number;
  maxHeight: number;
  targetBitrate: string;
  audioBitrate: string;
}

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

export interface MultiQualityResult {
  success: boolean;
  outputs: Partial<Record<QualityTier, { path: string; probe: ProbeResult }>>;
  thumbnailPath?: string;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: Required<TranscodeOptions> = {
  maxDurationMs: 30_000,
  maxWidth: 1080,
  maxHeight: 1920,
  targetBitrate: "1200k", // Default lowered from 2M — medium tier is the new default
  audioEnabled: true,
};

const FFPROBE_TIMEOUT_MS = 15_000;
const FFMPEG_TIMEOUT_MS = 120_000;

// ============================================================================
// ffprobe: Extract video metadata
// ============================================================================

export async function probeVideo(inputPath: string): Promise<ProbeResult> {
  const errors: string[] = [];

  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate",
        "-of",
        "json",
        inputPath,
      ],
      { timeout: FFPROBE_TIMEOUT_MS }
    );

    const data = JSON.parse(stdout);
    const format = data.format || {};
    const streams = data.streams || [];

    const videoStream = streams.find((s: Record<string, string>) => s.codec_type === "video");
    const audioStream = streams.find((s: Record<string, string>) => s.codec_type === "audio");

    if (!videoStream) {
      return {
        durationMs: 0,
        width: 0,
        height: 0,
        codec: "unknown",
        audioCodec: null,
        fps: 0,
        bitrate: 0,
        fileSize: 0,
        hasAudio: false,
        isCorrupt: true,
        errors: ["No video stream found"],
      };
    }

    // Parse frame rate (e.g. "30/1" or "30000/1001")
    let fps = 30;
    if (videoStream.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
      if (den && den > 0) fps = Math.round(num / den);
    }

    const fileStat = await stat(inputPath).catch(() => null);

    return {
      durationMs: Math.round((parseFloat(format.duration) || 0) * 1000),
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      codec: videoStream.codec_name || "unknown",
      audioCodec: audioStream?.codec_name || null,
      fps,
      bitrate: parseInt(format.bit_rate) || 0,
      fileSize: fileStat?.size || parseInt(format.size) || 0,
      hasAudio: !!audioStream,
      isCorrupt: false,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[Transcoder] ffprobe failed", { inputPath, error: message });
    return {
      durationMs: 0,
      width: 0,
      height: 0,
      codec: "unknown",
      audioCodec: null,
      fps: 0,
      bitrate: 0,
      fileSize: 0,
      hasAudio: false,
      isCorrupt: true,
      errors: [`ffprobe error: ${message}`],
    };
  }
}

// ============================================================================
// ffmpeg: Transcode video to standardised H.264 MP4
// ============================================================================

export async function transcodeVideo(
  inputPath: string,
  outputPath: string,
  options: TranscodeOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const args = [
    "-i",
    inputPath,
    "-y",
    // Video: H.264 with constrained baseline for broad compatibility
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-profile:v",
    "main",
    "-level",
    "4.0",
    "-b:v",
    opts.targetBitrate,
    "-maxrate",
    opts.targetBitrate,
    "-bufsize",
    `${parseInt(opts.targetBitrate) * 2}M`,
    // Scale down if exceeds max dimensions, preserve aspect ratio
    "-vf",
    `scale='min(${opts.maxWidth},iw)':min'(${opts.maxHeight},ih)':force_original_aspect_ratio=decrease`,
    // Duration limit
    "-t",
    String(opts.maxDurationMs / 1000),
    // Pixel format for compatibility
    "-pix_fmt",
    "yuv420p",
    // Faststart for streaming (moov atom at beginning)
    "-movflags",
    "+faststart",
  ];

  // Audio handling
  if (opts.audioEnabled) {
    const { audioBitrate = "96k" } = options as { audioBitrate?: string };
    args.push("-c:a", "aac", "-b:a", audioBitrate, "-ac", "2");
  } else {
    args.push("-an");
  }

  args.push(outputPath);

  try {
    await execFileAsync("ffmpeg", args, { timeout: FFMPEG_TIMEOUT_MS });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[Transcoder] ffmpeg transcode failed", { inputPath, error: message });
    return { success: false, error: message };
  }
}

// ============================================================================
// Thumbnail generation
// ============================================================================

export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  timestampSec: number = 0.5
): Promise<{ success: boolean; error?: string }> {
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-i",
        inputPath,
        "-y",
        "-ss",
        String(timestampSec),
        "-vframes",
        "1",
        "-vf",
        "scale=480:-2",
        "-q:v",
        "3",
        outputPath,
      ],
      { timeout: FFPROBE_TIMEOUT_MS }
    );
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[Transcoder] Thumbnail generation failed", { inputPath, error: message });
    return { success: false, error: message };
  }
}

// ============================================================================
// Multi-quality transcoding
// ============================================================================

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
    } as TranscodeOptions & { audioBitrate: string });

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

// ============================================================================
// Full processing job
// ============================================================================

export async function processVideoJob(
  clipId: number,
  localVideoPath: string,
  options: TranscodeOptions = {}
): Promise<TranscodeResult> {
  const workDir = await mkdtemp(join(tmpdir(), "skate-transcode-"));

  try {
    // 1. Probe original video
    const probe = await probeVideo(localVideoPath);
    if (probe.isCorrupt) {
      await updateClipStatus(clipId, "failed", "Video file is corrupt or unreadable");
      return { success: false, probe, error: "Video file is corrupt" };
    }

    const maxDuration = options.maxDurationMs ?? DEFAULT_OPTIONS.maxDurationMs;
    if (probe.durationMs > maxDuration + 1000) {
      // Allow 1s tolerance
      await updateClipStatus(clipId, "failed", `Duration ${probe.durationMs}ms exceeds limit`);
      return { success: false, probe, error: `Video too long: ${probe.durationMs}ms` };
    }

    // 2. Check if transcoding is needed
    const needsTranscode =
      probe.codec !== "h264" ||
      probe.width > (options.maxWidth ?? DEFAULT_OPTIONS.maxWidth) ||
      probe.height > (options.maxHeight ?? DEFAULT_OPTIONS.maxHeight);

    let finalVideoPath = localVideoPath;

    if (needsTranscode) {
      await updateClipStatus(clipId, "processing");
      const outputPath = join(workDir, "output.mp4");
      const result = await transcodeVideo(localVideoPath, outputPath, options);
      if (!result.success) {
        await updateClipStatus(clipId, "failed", `Transcode failed: ${result.error}`);
        return { success: false, probe, error: result.error };
      }
      finalVideoPath = outputPath;
    }

    // 3. Generate thumbnail
    const thumbPath = join(workDir, "thumb.jpg");
    const thumbResult = await generateThumbnail(finalVideoPath, thumbPath);

    // 4. Update DB with final probe data
    const finalProbe = needsTranscode ? await probeVideo(finalVideoPath) : probe;
    await updateClipMetadata(clipId, finalProbe);
    await updateClipStatus(clipId, "ready");

    return {
      success: true,
      outputPath: finalVideoPath,
      thumbnailPath: thumbResult.success ? thumbPath : undefined,
      probe: finalProbe,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[Transcoder] processVideoJob failed", { clipId, error: message });
    await updateClipStatus(clipId, "failed", message);
    return { success: false, error: message };
  } finally {
    // Cleanup temp directory
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ============================================================================
// DB helpers
// ============================================================================

async function updateClipStatus(
  clipId: number,
  status: string,
  errorMessage?: string
): Promise<void> {
  try {
    const db = getDb();
    await db
      .update(trickClips)
      .set({ status, updatedAt: new Date() })
      .where(eq(trickClips.id, clipId));
    if (errorMessage) {
      logger.warn("[Transcoder] Clip status set to failed", { clipId, reason: errorMessage });
    }
  } catch (err) {
    logger.error("[Transcoder] Failed to update clip status", { clipId, status, error: err });
  }
}

async function updateClipMetadata(clipId: number, probe: ProbeResult): Promise<void> {
  try {
    const db = getDb();
    await db
      .update(trickClips)
      .set({
        videoDurationMs: probe.durationMs,
        fileSizeBytes: probe.fileSize,
        updatedAt: new Date(),
      })
      .where(eq(trickClips.id, clipId));
  } catch (err) {
    logger.error("[Transcoder] Failed to update clip metadata", { clipId, error: err });
  }
}

// ============================================================================
// Utility: Check ffmpeg/ffprobe availability
// ============================================================================

export async function checkFfmpegAvailable(): Promise<{
  ffmpeg: boolean;
  ffprobe: boolean;
}> {
  const check = async (cmd: string) => {
    try {
      await execFileAsync(cmd, ["-version"], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  };

  return {
    ffmpeg: await check("ffmpeg"),
    ffprobe: await check("ffprobe"),
  };
}
