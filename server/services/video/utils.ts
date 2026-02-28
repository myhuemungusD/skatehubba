/**
 * Video Transcoding — Utilities
 *
 * Runtime availability checks for ffmpeg and ffprobe.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
