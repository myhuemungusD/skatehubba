/**
 * Video Transcoding — ffprobe Metadata Extraction
 *
 * Probes a video file using ffprobe and returns structured metadata.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import logger from "../../logger";
import { FFPROBE_TIMEOUT_MS } from "./quality";
import type { ProbeResult } from "./types";

const execFileAsync = promisify(execFile);

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
