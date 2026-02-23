/**
 * Video Transcoding — ffmpeg Encode & Thumbnail
 *
 * Transcodes a video to H.264/AAC MP4 and extracts a JPEG thumbnail.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import logger from "../../logger";
import { DEFAULT_OPTIONS, FFMPEG_TIMEOUT_MS, FFPROBE_TIMEOUT_MS } from "./quality";
import type { TranscodeOptions } from "./types";

const execFileAsync = promisify(execFile);

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
    const audioBitrate = options.audioBitrate ?? "96k";
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
