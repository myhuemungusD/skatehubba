import { Router } from "express";
import { authSessions } from "@shared/schema";
import { lt } from "drizzle-orm";
import { getDb, isDatabaseAvailable } from "../db";
import { verifyCronSecret } from "../middleware/cronAuth";
import { forfeitExpiredGames, notifyDeadlineWarnings } from "./games";
import logger from "../logger";

const router = Router();

// POST /api/cron/forfeit-expired-games — auto-forfeit expired games
router.post("/forfeit-expired-games", async (req, res) => {
  if (!verifyCronSecret(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await forfeitExpiredGames();
    logger.info("[Cron] Forfeit expired games completed", result);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error("[Cron] Forfeit expired games failed", { error });
    res.status(500).json({ error: "Failed to process forfeit" });
  }
});

// POST /api/cron/deadline-warnings — send deadline warnings (≤1 hour remaining)
router.post("/deadline-warnings", async (req, res) => {
  if (!verifyCronSecret(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await notifyDeadlineWarnings();
    logger.info("[Cron] Deadline warnings sent", result);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error("[Cron] Deadline warnings failed", { error });
    res.status(500).json({ error: "Failed to send deadline warnings" });
  }
});

// POST /api/cron/cleanup-sessions — clean up expired auth sessions (M5 audit finding)
router.post("/cleanup-sessions", async (req, res) => {
  if (!verifyCronSecret(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  try {
    const db = getDb();
    const result = await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
    const deleted = (result as { rowCount?: number }).rowCount ?? 0;
    logger.info("[Cron] Expired sessions cleaned up", { deleted });
    res.json({ success: true, deleted });
  } catch (error) {
    logger.error("[Cron] Session cleanup failed", { error });
    res.status(500).json({ error: "Failed to cleanup sessions" });
  }
});

export const cronRouter = router;
