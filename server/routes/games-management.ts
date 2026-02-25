/**
 * S.K.A.T.E. Game Management Routes
 * Handles game forfeit and game queries
 */

import { Router } from "express";
import { getDb } from "../db";
import { authenticateUser } from "../auth/middleware";
import { games, gameTurns, gameDisputes } from "@shared/schema";
import { eq, or, desc, and, sql } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";

const router = Router();

// ============================================================================
// POST /api/games/:id/forfeit — Voluntary forfeit
// ============================================================================

router.post("/:id/forfeit", authenticateUser, async (req, res) => {
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
// GET /api/games/stats/me — Player's game stats (wins, losses, streak, record)
// NOTE: Must be defined BEFORE /:id to avoid route shadowing
// ============================================================================

router.get("/stats/me", authenticateUser, async (req, res) => {
  const currentUserId = req.currentUser!.id;

  try {
    const db = getDb();

    const finishedGames = await db
      .select({
        id: games.id,
        winnerId: games.winnerId,
        player1Id: games.player1Id,
        player2Id: games.player2Id,
        player1Name: games.player1Name,
        player2Name: games.player2Name,
        completedAt: games.completedAt,
      })
      .from(games)
      .where(
        and(
          or(eq(games.player1Id, currentUserId), eq(games.player2Id, currentUserId)),
          or(eq(games.status, "completed"), eq(games.status, "forfeited"))
        )
      )
      .orderBy(desc(games.completedAt))
      .limit(100);

    const wins = finishedGames.filter((g) => g.winnerId === currentUserId).length;
    const losses = finishedGames.length - wins;

    let currentStreak = 0;
    for (const g of finishedGames) {
      if (g.winnerId === currentUserId) {
        currentStreak++;
      } else {
        break;
      }
    }

    let bestStreak = 0;
    let tempStreak = 0;
    for (const g of finishedGames) {
      if (g.winnerId === currentUserId) {
        tempStreak++;
        bestStreak = Math.max(bestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    const opponentRecords: Record<
      string,
      { name: string; wins: number; losses: number; streak: number }
    > = {};
    for (const g of finishedGames) {
      const opponentId = g.player1Id === currentUserId ? g.player2Id : g.player1Id;
      const opponentName = g.player1Id === currentUserId ? g.player2Name : g.player1Name;
      if (!opponentId) continue;
      if (!opponentRecords[opponentId]) {
        opponentRecords[opponentId] = {
          name: opponentName || "Skater",
          wins: 0,
          losses: 0,
          streak: 0,
        };
      }
      if (g.winnerId === currentUserId) {
        opponentRecords[opponentId].wins++;
      } else {
        opponentRecords[opponentId].losses++;
      }
    }

    for (const opponentId of Object.keys(opponentRecords)) {
      const opponentGames = finishedGames.filter(
        (g) =>
          (g.player1Id === opponentId || g.player2Id === opponentId) &&
          (g.player1Id === currentUserId || g.player2Id === currentUserId)
      );
      let streak = 0;
      for (const g of opponentGames) {
        if (g.winnerId === currentUserId) {
          streak++;
        } else {
          break;
        }
      }
      opponentRecords[opponentId].streak = streak;
    }

    const trickStats = await db
      .select({
        trick: gameTurns.trickDescription,
        count: sql<number>`count(*)::int`,
      })
      .from(gameTurns)
      .where(and(eq(gameTurns.playerId, currentUserId), eq(gameTurns.turnType, "set")))
      .groupBy(gameTurns.trickDescription)
      .orderBy(sql`count(*) DESC`)
      .limit(5);

    res.json({
      totalGames: finishedGames.length,
      wins,
      losses,
      winRate: finishedGames.length > 0 ? Math.round((wins / finishedGames.length) * 100) : 0,
      currentStreak,
      bestStreak,
      opponentRecords: Object.entries(opponentRecords).map(([id, record]) => ({
        opponentId: id,
        ...record,
      })),
      topTricks: trickStats.map((t) => ({ trick: t.trick, count: t.count })),
      recentGames: finishedGames.slice(0, 10).map((g) => ({
        id: g.id,
        won: g.winnerId === currentUserId,
        opponentName: g.player1Id === currentUserId ? g.player2Name : g.player1Name,
        completedAt: g.completedAt,
      })),
    });
  } catch (error) {
    logger.error("[Games] Failed to fetch stats", {
      error,
      userId: currentUserId,
    });
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ============================================================================
// GET /api/games/:id — Game details with turns and disputes
// ============================================================================

router.get("/:id", authenticateUser, async (req, res) => {
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
