/**
 * Video Transcoding — Database Helpers
 *
 * Thin wrappers around the trickClips table for status and metadata updates.
 */

import { getDb } from "../../db";
import { trickClips } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../../logger";
import type { ProbeResult } from "./types";

export async function updateClipStatus(
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

export async function updateClipMetadata(clipId: number, probe: ProbeResult): Promise<void> {
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
