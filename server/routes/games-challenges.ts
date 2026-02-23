/**
 * S.K.A.T.E. Game Challenge Routes
 * Handles challenge creation and responses
 */

import { Router } from "express";
import { getDb } from "../db";
import { authenticateUser } from "../auth/middleware";
import { games, customUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";
import { Errors } from "../utils/apiError";
import {
  createGameSchema,
  respondGameSchema,
  getUserDisplayName,
  TURN_DEADLINE_MS,
} from "./games-shared";

const router = Router();

// ============================================================================
// POST /api/games/create — Challenge an opponent
// ============================================================================

router.post("/create", authenticateUser, async (req, res) => {
  const parsed = createGameSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten());
  }

  const currentUserId = req.currentUser!.id;
  const { opponentId } = parsed.data;

  if (currentUserId === opponentId) {
    return Errors.badRequest(res, "SELF_CHALLENGE", "Cannot challenge yourself.");
  }

  try {
    const db = getDb();

    const opponent = await db
      .select({ id: customUsers.id })
      .from(customUsers)
      .where(eq(customUsers.id, opponentId))
      .limit(1);

    if (opponent.length === 0) {
      return Errors.notFound(res, "OPPONENT_NOT_FOUND", "Opponent not found.");
    }

    const [player1Name, player2Name] = await Promise.all([
      getUserDisplayName(db, currentUserId),
      getUserDisplayName(db, opponentId),
    ]);

    const [newGame] = await db
      .insert(games)
      .values({
        player1Id: currentUserId,
        player1Name,
        player2Id: opponentId,
        player2Name,
        status: "pending",
        currentTurn: currentUserId,
        turnPhase: "set_trick",
        offensivePlayerId: currentUserId,
        defensivePlayerId: opponentId,
      })
      .returning();

    // Notify opponent (push + email + in-app)
    await sendGameNotificationToUser(opponentId, "challenge_received", {
      gameId: newGame.id,
      challengerName: player1Name,
    });

    logger.info("[Games] Challenge created", {
      gameId: newGame.id,
      player1Id: currentUserId,
      player2Id: opponentId,
    });

    res.status(201).json({
      game: newGame,
      message: "Challenge sent.",
    });
  } catch (error) {
    logger.error("[Games] Failed to create game", {
      error,
      userId: currentUserId,
    });
    Errors.internal(res, "GAME_CREATE_FAILED", "Failed to create game.");
  }
});

// ============================================================================
// POST /api/games/:id/respond — Accept or decline challenge
// ============================================================================

router.post("/:id/respond", authenticateUser, async (req, res) => {
  const parsed = respondGameSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten());
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { accept } = parsed.data;

  try {
    const db = getDb();
    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);

    if (!game) return Errors.notFound(res, "GAME_NOT_FOUND", "Game not found.");
    if (game.player2Id !== currentUserId) {
      return Errors.forbidden(
        res,
        "NOT_CHALLENGED_PLAYER",
        "Only the challenged player can respond."
      );
    }
    if (game.status !== "pending") {
      return Errors.badRequest(res, "GAME_NOT_PENDING", "Game is not pending.");
    }

    const now = new Date();

    if (accept) {
      const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

      const [updatedGame] = await db
        .update(games)
        .set({
          status: "active",
          deadlineAt: deadline,
          updatedAt: now,
        })
        .where(eq(games.id, gameId))
        .returning();

      // Notify challenger: game accepted, your turn to set a trick
      await sendGameNotificationToUser(game.player1Id, "your_turn", {
        gameId,
        opponentName: game.player2Name || "Opponent",
      });

      logger.info("[Games] Challenge accepted", {
        gameId,
        acceptedBy: currentUserId,
      });

      res.json({ game: updatedGame, message: "Game on." });
    } else {
      const [updatedGame] = await db
        .update(games)
        .set({ status: "declined", updatedAt: now, completedAt: now })
        .where(eq(games.id, gameId))
        .returning();

      logger.info("[Games] Challenge declined", {
        gameId,
        declinedBy: currentUserId,
      });

      res.json({ game: updatedGame, message: "Challenge declined." });
    }
  } catch (error) {
    logger.error("[Games] Failed to respond to game", {
      error,
      gameId,
      userId: currentUserId,
    });
    Errors.internal(res, "GAME_RESPOND_FAILED", "Failed to respond to game.");
  }
});

export { router as gamesChallengesRouter };
