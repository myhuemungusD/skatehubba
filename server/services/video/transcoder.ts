/**
 * Video Transcoding — Job Orchestrator
 *
 * Coordinates probe → validate → transcode → thumbnail → DB update.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import logger from "../../logger";
import { probeVideo } from "./ffprobe";
import { transcodeVideo, generateThumbnail } from "./ffmpeg";
import { updateClipStatus, updateClipMetadata } from "./database";
import { DEFAULT_OPTIONS } from "./quality";
import type { TranscodeOptions, TranscodeResult } from "./types";

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
