/**
 * S.K.A.T.E. Game Turn Routes
 * Thin HTTP layer — business logic lives in gameTurnService
 */

import { Router } from "express";
import { getDb } from "../db";
import { authenticateUser } from "../auth/middleware";
import { gameTurns } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";
import { Errors } from "../utils/apiError";
import { submitTurnSchema, judgeTurnSchema, MAX_VIDEO_DURATION_MS } from "./games-shared";
import { submitTurn, judgeTurn, setterBail } from "../services/gameTurnService";

const router = Router();

// ============================================================================
// POST /api/games/:id/turns — Submit a video (set trick or response)
// ============================================================================

router.post("/:id/turns", authenticateUser, async (req, res) => {
  const parsed = submitTurnSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten());
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { trickDescription, videoUrl, videoDurationMs, thumbnailUrl } = parsed.data;

  if (videoDurationMs > MAX_VIDEO_DURATION_MS) {
    return Errors.badRequest(res, "VIDEO_TOO_LONG", "Video exceeds 15 second limit.");
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
        trickName: trickDescription,
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
    Errors.internal(res, "TURN_SUBMIT_FAILED", "Failed to submit turn.");
  }
});

// ============================================================================
// POST /api/games/turns/:turnId/judge — Defensive player judges LAND or BAIL
// ============================================================================

router.post("/turns/:turnId/judge", authenticateUser, async (req, res) => {
  const parsed = judgeTurnSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten());
  }

  const currentUserId = req.currentUser!.id;
  const { result } = parsed.data;

  // L2: Strict integer validation (parseInt("123abc") silently returns 123)
  if (!/^\d+$/.test(req.params.turnId)) {
    return Errors.badRequest(res, "INVALID_TURN_ID", "Invalid turn ID.");
  }
  const turnId = parseInt(req.params.turnId, 10);
  if (isNaN(turnId) || turnId <= 0) {
    return Errors.badRequest(res, "INVALID_TURN_ID", "Invalid turn ID.");
  }

  try {
    const db = getDb();

    // Read turn outside transaction (immutable after creation)
    const [turn] = await db.select().from(gameTurns).where(eq(gameTurns.id, turnId)).limit(1);

    if (!turn) return Errors.notFound(res, "TURN_NOT_FOUND", "Turn not found.");

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
    Errors.internal(res, "JUDGE_FAILED", "Failed to judge turn.");
  }
});

// ============================================================================
// POST /api/games/:id/setter-bail — Setter bails on their own trick
// ============================================================================

router.post("/:id/setter-bail", authenticateUser, async (req, res) => {
  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;

  try {
    const db = getDb();

    const txResult = await db.transaction(async (tx) => setterBail(tx, gameId, currentUserId));

    if (!txResult.ok) {
      return res.status(txResult.status).json({ error: txResult.error });
    }

    // Send notifications after transaction commits
    for (const n of txResult.notifications) {
      await sendGameNotificationToUser(n.playerId, n.type, n.data);
    }

    logger.info("[Games] Setter bailed own trick", {
      gameId,
      playerId: currentUserId,
      gameOver: txResult.gameOver,
    });

    res.json({
      game: txResult.game,
      gameOver: txResult.gameOver,
      winnerId: txResult.winnerId,
      message: txResult.message,
    });
  } catch (error) {
    logger.error("[Games] Failed to process setter bail", {
      error,
      gameId,
      userId: currentUserId,
    });
    Errors.internal(res, "SETTER_BAIL_FAILED", "Failed to process setter bail.");
  }
});

export { router as gamesTurnsRouter };
