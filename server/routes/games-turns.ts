/**
 * S.K.A.T.E. Game Turn Routes
 * Handles turn submission and judging
 */

import { Router } from "express";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import { games, gameTurns } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";
import {
  submitTurnSchema,
  judgeTurnSchema,
  MAX_VIDEO_DURATION_MS,
  TURN_DEADLINE_MS,
  SKATE_LETTERS,
  isGameOver,
} from "./games-shared";

const router = Router();

// ============================================================================
// POST /api/games/:id/turns — Submit a video (set trick or response)
// One take. No retries. No previews. Auto-sent.
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

  // Hard constraint: max 15 seconds
  if (videoDurationMs > MAX_VIDEO_DURATION_MS) {
    return res.status(400).json({ error: "Video exceeds 15 second limit" });
  }

  try {
    const db = getDb();

    // All validation + mutations in a transaction with row-level locking
    const txResult = await db.transaction(async (tx) => {
      // Lock game row to prevent concurrent turn submissions
      await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);

      const [game] = await tx.select().from(games).where(eq(games.id, gameId)).limit(1);

      if (!game) return { ok: false as const, status: 404, error: "Game not found" };

      const isPlayer1 = game.player1Id === currentUserId;
      const isPlayer2 = game.player2Id === currentUserId;
      if (!isPlayer1 && !isPlayer2)
        return {
          ok: false as const,
          status: 403,
          error: "You are not a player in this game",
        };
      if (game.status !== "active")
        return {
          ok: false as const,
          status: 400,
          error: "Game is not active",
        };
      if (game.currentTurn !== currentUserId)
        return { ok: false as const, status: 400, error: "Not your turn" };

      // Check deadline
      if (game.deadlineAt && new Date(game.deadlineAt) < new Date())
        return {
          ok: false as const,
          status: 400,
          error: "Turn deadline has passed. Game forfeited.",
        };

      // Determine turn type based on phase
      const turnPhase = game.turnPhase || "set_trick";
      let turnType: "set" | "response";

      if (turnPhase === "set_trick") {
        if (currentUserId !== game.offensivePlayerId)
          return {
            ok: false as const,
            status: 400,
            error: "Only the offensive player can set a trick",
          };
        turnType = "set";
      } else if (turnPhase === "respond_trick") {
        if (currentUserId !== game.defensivePlayerId)
          return {
            ok: false as const,
            status: 400,
            error: "Only the defensive player can respond",
          };
        turnType = "response";
      } else {
        return {
          ok: false as const,
          status: 400,
          error: "Current phase does not accept video submissions",
        };
      }

      // Get turn count
      const turnCountResult = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(gameTurns)
        .where(eq(gameTurns.gameId, gameId));

      const turnNumber = (turnCountResult[0]?.count || 0) + 1;
      const playerName = isPlayer1 ? game.player1Name : game.player2Name;

      // Create the turn record
      const [newTurn] = await tx
        .insert(gameTurns)
        .values({
          gameId,
          playerId: currentUserId,
          playerName: playerName || "Skater",
          turnNumber,
          turnType,
          trickDescription,
          videoUrl,
          videoDurationMs,
          thumbnailUrl: thumbnailUrl ?? null,
          result: "pending",
        })
        .returning();

      const now = new Date();
      const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

      if (turnType === "set") {
        await tx
          .update(games)
          .set({
            currentTurn: game.defensivePlayerId,
            turnPhase: "respond_trick",
            lastTrickDescription: trickDescription,
            lastTrickBy: currentUserId,
            deadlineAt: deadline,
            updatedAt: now,
          })
          .where(eq(games.id, gameId));

        return {
          ok: true as const,
          turn: newTurn,
          message: "Trick set. Sent.",
          notify: game.defensivePlayerId
            ? {
                playerId: game.defensivePlayerId,
                opponentName: playerName || "Opponent",
              }
            : null,
        };
      } else {
        await tx
          .update(games)
          .set({
            currentTurn: game.defensivePlayerId,
            turnPhase: "judge",
            deadlineAt: deadline,
            updatedAt: now,
          })
          .where(eq(games.id, gameId));

        return {
          ok: true as const,
          turn: newTurn,
          message: "Response sent. Now judge the trick.",
          notify: null,
        };
      }
    });

    if (!txResult.ok) {
      return res.status(txResult.status).json({ error: txResult.error });
    }

    // Send notifications after transaction commits (push + email + in-app)
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
// Must happen after defender uploads response video
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

    // All game state mutations in a transaction with row-level locking
    const txResult = await db.transaction(async (tx) => {
      // Lock game row to prevent concurrent judge/forfeit/dispute
      await tx.execute(sql`SELECT id FROM games WHERE id = ${turn.gameId} FOR UPDATE`);

      const [game] = await tx.select().from(games).where(eq(games.id, turn.gameId)).limit(1);

      if (!game) return { ok: false as const, status: 404, error: "Game not found" };
      if (currentUserId !== game.defensivePlayerId)
        return {
          ok: false as const,
          status: 403,
          error: "Only the defending player can judge",
        };
      if (game.turnPhase !== "judge")
        return {
          ok: false as const,
          status: 400,
          error: "Game is not in judging phase",
        };
      if (game.currentTurn !== currentUserId)
        return {
          ok: false as const,
          status: 400,
          error: "Not your turn to judge",
        };

      // Re-check turn result inside transaction (prevents double-judge race)
      const [currentTurn] = await tx
        .select()
        .from(gameTurns)
        .where(eq(gameTurns.id, turnId))
        .limit(1);

      if (!currentTurn || currentTurn.result !== "pending")
        return {
          ok: false as const,
          status: 400,
          error: "Turn has already been judged",
        };

      // Verify defender has submitted their response video
      const responseVideos = await tx
        .select()
        .from(gameTurns)
        .where(
          and(
            eq(gameTurns.gameId, game.id),
            eq(gameTurns.playerId, currentUserId),
            eq(gameTurns.turnType, "response")
          )
        );

      const hasResponseForThisRound = responseVideos.some((rv) => rv.turnNumber > turn.turnNumber);

      if (!hasResponseForThisRound)
        return {
          ok: false as const,
          status: 400,
          error: "You must submit your response video before judging",
        };

      const now = new Date();

      // Update the turn with judgment
      await tx
        .update(gameTurns)
        .set({ result, judgedBy: currentUserId, judgedAt: now })
        .where(eq(gameTurns.id, turnId));

      // Determine game state changes
      const isPlayer1 = game.player1Id === currentUserId;
      let newPlayer1Letters = game.player1Letters || "";
      let newPlayer2Letters = game.player2Letters || "";
      let newOffensiveId: string;
      let newDefensiveId: string;

      if (result === "missed") {
        // BAIL: defensive player gets a letter, roles STAY the same
        if (isPlayer1) {
          newPlayer1Letters += SKATE_LETTERS[newPlayer1Letters.length] || "";
        } else {
          newPlayer2Letters += SKATE_LETTERS[newPlayer2Letters.length] || "";
        }
        newOffensiveId = game.offensivePlayerId!;
        newDefensiveId = game.defensivePlayerId!;
      } else {
        // LAND: roles swap
        newOffensiveId = game.defensivePlayerId!;
        newDefensiveId = game.offensivePlayerId!;
      }

      const gameOverCheck = isGameOver(newPlayer1Letters, newPlayer2Letters);
      const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

      if (gameOverCheck.over) {
        const winnerId = gameOverCheck.loserId === "player1" ? game.player2Id : game.player1Id;

        const [updatedGame] = await tx
          .update(games)
          .set({
            player1Letters: newPlayer1Letters,
            player2Letters: newPlayer2Letters,
            status: "completed",
            winnerId,
            completedAt: now,
            updatedAt: now,
            turnPhase: null,
            currentTurn: null,
            deadlineAt: null,
          })
          .where(eq(games.id, game.id))
          .returning();

        return {
          ok: true as const,
          response: {
            game: updatedGame,
            turn: { ...turn, result, judgedBy: currentUserId, judgedAt: now },
            gameOver: true,
            winnerId,
            message: "Game over.",
          },
          notifications: [game.player1Id, game.player2Id].filter(Boolean).map((pid) => ({
            playerId: pid as string,
            type: "game_over" as const,
            data: {
              gameId: game.id,
              winnerId: winnerId || undefined,
              youWon: pid === winnerId,
            },
          })),
        };
      } else {
        const [updatedGame] = await tx
          .update(games)
          .set({
            player1Letters: newPlayer1Letters,
            player2Letters: newPlayer2Letters,
            currentTurn: newOffensiveId,
            turnPhase: "set_trick",
            offensivePlayerId: newOffensiveId,
            defensivePlayerId: newDefensiveId,
            deadlineAt: deadline,
            updatedAt: now,
          })
          .where(eq(games.id, game.id))
          .returning();

        const letterMessage = result === "missed" ? "BAIL. Letter earned." : "LAND. Roles swap.";

        return {
          ok: true as const,
          response: {
            game: updatedGame,
            turn: { ...turn, result, judgedBy: currentUserId, judgedAt: now },
            gameOver: false,
            message: letterMessage,
          },
          notifications: [
            {
              playerId: newOffensiveId,
              type: "your_turn" as const,
              data: {
                gameId: game.id,
                opponentName: (isPlayer1 ? game.player2Name : game.player1Name) || "Opponent",
              },
            },
          ],
        };
      }
    });

    // Handle validation errors from transaction
    if (!txResult.ok) {
      return res.status(txResult.status).json({ error: txResult.error });
    }

    // Send notifications after transaction commits (push + email + in-app)
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
