/**
 * validateChallengeVideo Cloud Function
 *
 * Storage trigger that validates uploaded challenge videos.
 * Deletes videos that don't match the required ~15 second duration.
 */

import * as crypto from "crypto";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

ffmpeg.setFfprobePath(ffprobeInstaller.path);

export const validateChallengeVideo = functions.storage.object().onFinalize(async (object) => {
  const filePath = object.name;
  if (!filePath || !filePath.startsWith("challenges/")) {
    return;
  }

  if (object.contentType && !object.contentType.startsWith("video/")) {
    return;
  }

  const bucket = admin.storage().bucket(object.bucket);
  const file = bucket.file(filePath);
  const tempFilePath = path.join(
    os.tmpdir(),
    `${path.basename(filePath)}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`
  );

  try {
    await file.download({ destination: tempFilePath });

    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(
        tempFilePath,
        (err: Error | null, metadata: { format?: { duration?: number } }) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(metadata?.format?.duration ?? 0);
        }
      );
    });

    if (duration < 14.5 || duration > 15.5) {
      await file.delete();
      functions.logger.warn(
        `[validateChallengeVideo] Deleted invalid clip ${filePath} (duration ${duration}s)`
      );
    }
  } catch (error) {
    functions.logger.error("[validateChallengeVideo] Failed to validate clip:", filePath, error);
  } finally {
    try {
      fs.unlinkSync(tempFilePath);
    } catch {
      // Ignore temp cleanup errors
    }
  }
});
