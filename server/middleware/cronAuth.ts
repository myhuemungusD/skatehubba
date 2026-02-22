import crypto from "node:crypto";
import logger from "../logger";

/** Timing-safe cron secret verification to prevent timing attacks */
export const verifyCronSecret = (authHeader: string | undefined): boolean => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.warn("[Cron] CRON_SECRET not configured — rejecting request");
    return false;
  }
  const expected = `Bearer ${cronSecret}`;
  if (!authHeader || authHeader.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    return false;
  }
};
