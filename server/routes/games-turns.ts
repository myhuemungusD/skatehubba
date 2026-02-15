/**
 * S.K.A.T.E. Game Turn Routes
 * Thin HTTP layer — business logic lives in gameTurnService
 */

import { Router } from "express";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import { gameTurns } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";
import { submitTurnSchema, judgeTurnSchema, MAX_VIDEO_DURATION_MS } from "./games-shared";
import { submitTurn, judgeTurn } from "../services/gameTurnService";

const router = Router();

// ============================================================================
// POST /api/games/:id/turns — Submit a video (set trick or response)
// ============================================================================

router.post("/:id/turns", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = submitTurnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { trickDescription, videoUrl, videoDurationMs, thumbnailUrl } = parsed.data;

  if (videoDurationMs > MAX_VIDEO_DURATION_MS) {
    return res.status(400).json({ error: "Video exceeds 15 second limit" });
  }

  try {
    const db = getDb();

    const txResult = await db.transaction(async (tx) =>
      submitTurn(tx, {
        gameId,
        playerId: currentUserId,
        trickDescription,
        videoUrl,
        videoDurationMs,
        thumbnailUrl,
      })
    );

    if (!txResult.ok) {
      return res.status(txResult.status).json({ error: txResult.error });
    }

    // Send notifications after transaction commits
    if (txResult.notify) {
      await sendGameNotificationToUser(txResult.notify.playerId, "your_turn", {
        gameId,
        opponentName: txResult.notify.opponentName,
      });
    }

    logger.info("[Games] Turn submitted", {
      gameId,
      turnId: txResult.turn.id,
      playerId: currentUserId,
    });

    res.status(201).json({
      turn: txResult.turn,
      message: txResult.message,
    });
  } catch (error) {
    logger.error("[Games] Failed to submit turn", {
      error,
      gameId,
      userId: currentUserId,
    });
    res.status(500).json({ error: "Failed to submit turn" });
  }
});

// ============================================================================
// POST /api/games/turns/:turnId/judge — Defensive player judges LAND or BAIL
// ============================================================================

router.post("/turns/:turnId/judge", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = judgeTurnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const turnId = parseInt(req.params.turnId, 10);
  const { result } = parsed.data;

  if (isNaN(turnId)) {
    return res.status(400).json({ error: "Invalid turn ID" });
  }

  try {
    const db = getDb();

    // Read turn outside transaction (immutable after creation)
    const [turn] = await db.select().from(gameTurns).where(eq(gameTurns.id, turnId)).limit(1);

    if (!turn) return res.status(404).json({ error: "Turn not found" });

    const txResult = await db.transaction(async (tx) =>
      judgeTurn(tx, turnId, currentUserId, result, turn)
    );

    if (!txResult.ok) {
      return res.status(txResult.status).json({ error: txResult.error });
    }

    // Send notifications after transaction commits
    for (const n of txResult.notifications) {
      await sendGameNotificationToUser(n.playerId, n.type, n.data);
    }

    logger.info("[Games] Turn judged", {
      gameId: txResult.response.game.id,
      turnId,
      result,
      judgedBy: currentUserId,
    });

    res.json(txResult.response);
  } catch (error) {
    logger.error("[Games] Failed to judge turn", {
      error,
      turnId,
      userId: currentUserId,
    });
    res.status(500).json({ error: "Failed to judge turn" });
  }
});

export { router as gamesTurnsRouter };
