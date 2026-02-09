/**
 * S.K.A.T.E. Game Management Routes
 * Handles game forfeit and game queries
 */

import { Router } from "express";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import { games, gameTurns, gameDisputes } from "@shared/schema";
import { eq, or, desc } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";

const router = Router();

// ============================================================================
// POST /api/games/:id/forfeit — Voluntary forfeit
// ============================================================================

router.post("/:id/forfeit", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;

  try {
    const db = getDb();

    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);

    if (!game) return res.status(404).json({ error: "Game not found" });

    const isPlayer1 = game.player1Id === currentUserId;
    const isPlayer2 = game.player2Id === currentUserId;
    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ error: "You are not a player in this game" });
    }
    if (game.status !== "active") {
      return res.status(400).json({ error: "Game is not active" });
    }

    const now = new Date();
    const winnerId = isPlayer1 ? game.player2Id : game.player1Id;

    const [updatedGame] = await db
      .update(games)
      .set({
        status: "forfeited",
        winnerId,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(games.id, gameId))
      .returning();

    // Notify opponent (push + email + in-app)
    if (winnerId) {
      await sendGameNotificationToUser(winnerId, "opponent_forfeited", {
        gameId,
      });
    }

    logger.info("[Games] Game forfeited", {
      gameId,
      forfeitedBy: currentUserId,
      winnerId,
    });

    res.json({ game: updatedGame, message: "You forfeited." });
  } catch (error) {
    logger.error("[Games] Failed to forfeit game", {
      error,
      gameId,
      userId: currentUserId,
    });
    res.status(500).json({ error: "Failed to forfeit game" });
  }
});

// ============================================================================
// GET /api/games/my-games — List my games
// ============================================================================

router.get("/my-games", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const currentUserId = req.currentUser!.id;

  try {
    const db = getDb();

    const userGames = await db
      .select()
      .from(games)
      .where(or(eq(games.player1Id, currentUserId), eq(games.player2Id, currentUserId)))
      .orderBy(desc(games.updatedAt))
      .limit(50);

    const pendingChallenges = userGames.filter(
      (g) => g.status === "pending" && g.player2Id === currentUserId
    );
    const sentChallenges = userGames.filter(
      (g) => g.status === "pending" && g.player1Id === currentUserId
    );
    const activeGames = userGames.filter((g) => g.status === "active");
    const completedGames = userGames.filter(
      (g) => g.status === "completed" || g.status === "declined" || g.status === "forfeited"
    );

    res.json({
      pendingChallenges,
      sentChallenges,
      activeGames,
      completedGames,
      total: userGames.length,
    });
  } catch (error) {
    logger.error("[Games] Failed to fetch my games", {
      error,
      userId: currentUserId,
    });
    res.status(500).json({ error: "Failed to fetch games" });
  }
});

// ============================================================================
// GET /api/games/:id — Game details with turns and disputes
// ============================================================================

router.get("/:id", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;

  try {
    const db = getDb();

    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);

    if (!game) return res.status(404).json({ error: "Game not found" });

    if (game.player1Id !== currentUserId && game.player2Id !== currentUserId) {
      return res.status(403).json({ error: "You are not a player in this game" });
    }

    const turns = await db
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.gameId, gameId))
      .orderBy(gameTurns.turnNumber);

    const disputes = await db
      .select()
      .from(gameDisputes)
      .where(eq(gameDisputes.gameId, gameId))
      .orderBy(gameDisputes.createdAt);

    const isMyTurn = game.currentTurn === currentUserId;
    const pendingSetTurn = turns.find(
      (t) => t.result === "pending" && t.turnType === "set" && t.playerId !== currentUserId
    );
    const needsToJudge = game.turnPhase === "judge" && game.currentTurn === currentUserId;
    const needsToRespond = game.turnPhase === "respond_trick" && game.currentTurn === currentUserId;

    const isPlayer1 = game.player1Id === currentUserId;
    const canDispute = isPlayer1 ? !game.player1DisputeUsed : !game.player2DisputeUsed;

    res.json({
      game,
      turns,
      disputes,
      isMyTurn,
      needsToJudge,
      needsToRespond,
      pendingTurnId: needsToJudge && pendingSetTurn ? pendingSetTurn.id : null,
      canDispute,
    });
  } catch (error) {
    logger.error("[Games] Failed to fetch game details", {
      error,
      gameId,
      userId: currentUserId,
    });
    res.status(500).json({ error: "Failed to fetch game" });
  }
});

export { router as gamesManagementRouter };
