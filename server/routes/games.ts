/**
 * Async S.K.A.T.E. Game Routes
 *
 * Turn-based, asynchronous game inspired by domino/chess-by-mail mechanics.
 * No live play, no retries, no previews. Ruthless, simple, final.
 *
 * Core loop:
 *   1. Offensive player sets a trick (records video, auto-sends)
 *   2. Defensive player watches, records response (one take, auto-sends)
 *   3. Defensive player judges offensive trick: LAND or BAIL
 *   4. If BAIL → defender gets next letter; roles stay
 *   5. If LAND → roles swap
 *   6. First to spell S.K.A.T.E. loses
 */

import { Router } from "express";
import { z } from "zod";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import {
  games,
  gameTurns,
  gameDisputes,
  customUsers,
  usernames,
  userProfiles,
} from "@shared/schema";
import { eq, or, desc, and, lt, sql } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotification, sendGameNotificationToUser } from "../services/gameNotificationService";

const router = Router();

// ============================================================================
// Constants
// ============================================================================

const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_VIDEO_DURATION_MS = 15_000; // 15 seconds hard cap
const SKATE_LETTERS = "SKATE";

// Dedup deadline warnings: track gameId → last warning timestamp
// Prevents spamming the same player every cron cycle
const deadlineWarningsSent = new Map<string, number>();
const DEADLINE_WARNING_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between warnings

// ============================================================================
// Validation Schemas
// ============================================================================

const createGameSchema = z.object({
  opponentId: z.string().min(1, "Opponent ID is required"),
});

const respondGameSchema = z.object({
  accept: z.boolean(),
});

const submitTurnSchema = z.object({
  trickDescription: z.string().min(1).max(500),
  videoUrl: z.string().url().max(500),
  videoDurationMs: z.number().int().min(1).max(MAX_VIDEO_DURATION_MS),
});

const judgeTurnSchema = z.object({
  result: z.enum(["landed", "missed"]),
});

const disputeSchema = z.object({
  turnId: z.number().int().positive(),
});

const resolveDisputeSchema = z.object({
  disputeId: z.number().int().positive(),
  finalResult: z.enum(["landed", "missed"]),
});

// ============================================================================
// Helpers
// ============================================================================

async function getUserDisplayName(
  db: ReturnType<typeof getDb>,
  odv: string
): Promise<string> {
  const usernameResult = await db
    .select({ username: usernames.username })
    .from(usernames)
    .where(eq(usernames.uid, odv))
    .limit(1);

  if (usernameResult[0]?.username) {
    return usernameResult[0].username;
  }

  const userResult = await db
    .select({ firstName: customUsers.firstName })
    .from(customUsers)
    .where(eq(customUsers.id, odv))
    .limit(1);

  return userResult[0]?.firstName || "Skater";
}

function isGameOver(
  player1Letters: string,
  player2Letters: string
): { over: boolean; loserId: "player1" | "player2" | null } {
  if (player1Letters.length >= 5) return { over: true, loserId: "player1" };
  if (player2Letters.length >= 5) return { over: true, loserId: "player2" };
  return { over: false, loserId: null };
}

// ============================================================================
// POST /api/games/create — Challenge an opponent
// ============================================================================

router.post("/create", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = createGameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const { opponentId } = parsed.data;

  if (currentUserId === opponentId) {
    return res.status(400).json({ error: "Cannot challenge yourself" });
  }

  try {
    const db = getDb();

    const opponent = await db
      .select({ id: customUsers.id })
      .from(customUsers)
      .where(eq(customUsers.id, opponentId))
      .limit(1);

    if (opponent.length === 0) {
      return res.status(404).json({ error: "Opponent not found" });
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
    res.status(500).json({ error: "Failed to create game" });
  }
});

// ============================================================================
// POST /api/games/:id/respond — Accept or decline challenge
// ============================================================================

router.post("/:id/respond", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = respondGameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { accept } = parsed.data;

  try {
    const db = getDb();
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (!game) return res.status(404).json({ error: "Game not found" });
    if (game.player2Id !== currentUserId) {
      return res
        .status(403)
        .json({ error: "Only the challenged player can respond" });
    }
    if (game.status !== "pending") {
      return res.status(400).json({ error: "Game is not pending" });
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
    res.status(500).json({ error: "Failed to respond to game" });
  }
});

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
    return res
      .status(400)
      .json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { trickDescription, videoUrl, videoDurationMs } = parsed.data;

  // Hard constraint: max 15 seconds
  if (videoDurationMs > MAX_VIDEO_DURATION_MS) {
    return res.status(400).json({ error: "Video exceeds 15 second limit" });
  }

  try {
    const db = getDb();

    // All validation + mutations in a transaction with row-level locking
    const txResult = await db.transaction(async (tx) => {
      // Lock game row to prevent concurrent turn submissions
      await tx.execute(
        sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`
      );

      const [game] = await tx
        .select()
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);

      if (!game)
        return { ok: false as const, status: 404, error: "Game not found" };

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
    return res
      .status(400)
      .json({ error: "Invalid request", issues: parsed.error.flatten() });
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
    const [turn] = await db
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.id, turnId))
      .limit(1);

    if (!turn) return res.status(404).json({ error: "Turn not found" });

    // All game state mutations in a transaction with row-level locking
    const txResult = await db.transaction(async (tx) => {
      // Lock game row to prevent concurrent judge/forfeit/dispute
      await tx.execute(
        sql`SELECT id FROM games WHERE id = ${turn.gameId} FOR UPDATE`
      );

      const [game] = await tx
        .select()
        .from(games)
        .where(eq(games.id, turn.gameId))
        .limit(1);

      if (!game)
        return { ok: false as const, status: 404, error: "Game not found" };
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

      const hasResponseForThisRound = responseVideos.some(
        (rv) => rv.turnNumber > turn.turnNumber
      );

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
        const winnerId =
          gameOverCheck.loserId === "player1"
            ? game.player2Id
            : game.player1Id;

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
          notifications: [game.player1Id, game.player2Id]
            .filter(Boolean)
            .map((pid) => ({
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

        const letterMessage =
          result === "missed" ? "BAIL. Letter earned." : "LAND. Roles swap.";

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
                opponentName:
                  (isPlayer1 ? game.player2Name : game.player1Name) ||
                  "Opponent",
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

// ============================================================================
// POST /api/games/:id/dispute — File a dispute (max 1 per player per game)
// Only after a BAIL judgment. Finite. Final. Has cost.
// ============================================================================

router.post("/:id/dispute", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = disputeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { turnId } = parsed.data;

  try {
    const db = getDb();

    // Transaction prevents concurrent dispute filings bypassing the 1-per-player limit
    const txResult = await db.transaction(async (tx) => {
      // Lock game row
      await tx.execute(
        sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`
      );

      const [game] = await tx
        .select()
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);

      if (!game)
        return { ok: false as const, status: 404, error: "Game not found" };

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

      const disputeUsed = isPlayer1
        ? game.player1DisputeUsed
        : game.player2DisputeUsed;
      if (disputeUsed)
        return {
          ok: false as const,
          status: 400,
          error: "You have already used your dispute for this game",
        };

      // Get the turn being disputed
      const [turn] = await tx
        .select()
        .from(gameTurns)
        .where(eq(gameTurns.id, turnId))
        .limit(1);

      if (!turn)
        return { ok: false as const, status: 404, error: "Turn not found" };
      if (turn.gameId !== gameId)
        return {
          ok: false as const,
          status: 400,
          error: "Turn does not belong to this game",
        };
      if (turn.result !== "missed")
        return {
          ok: false as const,
          status: 400,
          error: "Can only dispute a BAIL judgment",
        };
      if (turn.playerId !== currentUserId)
        return {
          ok: false as const,
          status: 400,
          error: "You can only dispute judgments on your own tricks",
        };
      if (!turn.judgedBy)
        return {
          ok: false as const,
          status: 400,
          error: "Turn has not been judged yet",
        };

      // Mark dispute as used + create dispute record atomically
      const disputeField = isPlayer1
        ? { player1DisputeUsed: true }
        : { player2DisputeUsed: true };

      await tx.update(games).set(disputeField).where(eq(games.id, gameId));

      const [dispute] = await tx
        .insert(gameDisputes)
        .values({
          gameId,
          turnId,
          disputedBy: currentUserId,
          againstPlayerId: turn.judgedBy,
          originalResult: "missed",
        })
        .returning();

      const opponentId = isPlayer1 ? game.player2Id : game.player1Id;
      return { ok: true as const, dispute, opponentId };
    });

    if (!txResult.ok) {
      return res.status(txResult.status).json({ error: txResult.error });
    }

    logger.info("[Games] Dispute filed", {
      gameId,
      turnId,
      disputeId: txResult.dispute.id,
      disputedBy: currentUserId,
    });

    // Notify opponent after transaction commits (push + email + in-app)
    if (txResult.opponentId) {
      await sendGameNotificationToUser(txResult.opponentId, "dispute_filed", {
        gameId,
        disputeId: txResult.dispute.id,
      });
    }

    res.status(201).json({
      dispute: txResult.dispute,
      message: "Dispute filed. Awaiting resolution.",
    });
  } catch (error) {
    logger.error("[Games] Failed to file dispute", {
      error,
      gameId,
      userId: currentUserId,
    });
    res.status(500).json({ error: "Failed to file dispute" });
  }
});

// ============================================================================
// POST /api/games/disputes/:disputeId/resolve — Resolve a dispute
// Opponent resolves. Final. Loser gets permanent reputation penalty.
// ============================================================================

router.post(
  "/disputes/:disputeId/resolve",
  authenticateUser,
  async (req, res) => {
    if (!isDatabaseAvailable()) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const parsed = resolveDisputeSchema.safeParse({
      ...req.body,
      disputeId: parseInt(req.params.disputeId, 10),
    });
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid request", issues: parsed.error.flatten() });
    }

    const currentUserId = req.currentUser!.id;
    const { disputeId, finalResult } = parsed.data;

    try {
      const db = getDb();

      // Transaction for atomicity: resolve dispute + apply penalty + swap roles
      const txResult = await db.transaction(async (tx) => {
        // Lock dispute row to prevent double-resolution
        await tx.execute(
          sql`SELECT id FROM game_disputes WHERE id = ${disputeId} FOR UPDATE`
        );

        const [dispute] = await tx
          .select()
          .from(gameDisputes)
          .where(eq(gameDisputes.id, disputeId))
          .limit(1);

        if (!dispute)
          return {
            ok: false as const,
            status: 404,
            error: "Dispute not found",
          };
        if (dispute.finalResult)
          return {
            ok: false as const,
            status: 400,
            error: "Dispute already resolved",
          };
        if (dispute.againstPlayerId !== currentUserId)
          return {
            ok: false as const,
            status: 403,
            error: "Only the judging player can resolve the dispute",
          };

        // Lock game row too
        await tx.execute(
          sql`SELECT id FROM games WHERE id = ${dispute.gameId} FOR UPDATE`
        );

        const [game] = await tx
          .select()
          .from(games)
          .where(eq(games.id, dispute.gameId))
          .limit(1);

        if (!game)
          return { ok: false as const, status: 404, error: "Game not found" };
        if (game.status !== "active")
          return {
            ok: false as const,
            status: 400,
            error: "Game is no longer active",
          };

        const now = new Date();

        // Determine who gets penalized
        let penaltyTarget: string;
        if (finalResult === "landed") {
          penaltyTarget = dispute.againstPlayerId;
        } else {
          penaltyTarget = dispute.disputedBy;
        }

        // Resolve the dispute
        await tx
          .update(gameDisputes)
          .set({
            finalResult,
            resolvedBy: currentUserId,
            resolvedAt: now,
            penaltyAppliedTo: penaltyTarget,
          })
          .where(eq(gameDisputes.id, disputeId));

        // Apply permanent reputation penalty
        await tx
          .update(userProfiles)
          .set({
            disputePenalties: sql`${userProfiles.disputePenalties} + 1`,
          })
          .where(eq(userProfiles.id, penaltyTarget));

        // If overturned to LAND, reverse the letter and swap roles
        if (finalResult === "landed") {
          const defenderIsPlayer1 =
            game.player1Id === dispute.againstPlayerId;
          const currentLetters = defenderIsPlayer1
            ? game.player1Letters || ""
            : game.player2Letters || "";

          const letterUpdate = defenderIsPlayer1
            ? {
                player1Letters:
                  currentLetters.length > 0
                    ? currentLetters.slice(0, -1)
                    : "",
              }
            : {
                player2Letters:
                  currentLetters.length > 0
                    ? currentLetters.slice(0, -1)
                    : "",
              };

          const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

          // Remove letter + swap roles (LAND = roles swap)
          await tx
            .update(games)
            .set({
              ...letterUpdate,
              offensivePlayerId: dispute.againstPlayerId,
              defensivePlayerId: dispute.disputedBy,
              currentTurn: dispute.againstPlayerId,
              turnPhase: "set_trick",
              deadlineAt: deadline,
              updatedAt: now,
            })
            .where(eq(games.id, game.id));

          // Update the turn result to landed
          await tx
            .update(gameTurns)
            .set({ result: "landed" })
            .where(eq(gameTurns.id, dispute.turnId));
        }

        return {
          ok: true as const,
          dispute: {
            ...dispute,
            finalResult,
            resolvedBy: currentUserId,
            resolvedAt: now,
            penaltyAppliedTo: penaltyTarget,
          },
          penaltyTarget,
        };
      });

      if (!txResult.ok) {
        return res.status(txResult.status).json({ error: txResult.error });
      }

      logger.info("[Games] Dispute resolved", {
        disputeId,
        finalResult,
        penaltyTarget: txResult.penaltyTarget,
      });

      res.json({
        dispute: txResult.dispute,
        message:
          finalResult === "landed"
            ? "Dispute upheld. BAIL overturned to LAND. Letter removed."
            : "Dispute denied. BAIL stands.",
      });
    } catch (error) {
      logger.error("[Games] Failed to resolve dispute", {
        error,
        disputeId,
        userId: currentUserId,
      });
      res.status(500).json({ error: "Failed to resolve dispute" });
    }
  }
);

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

    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (!game) return res.status(404).json({ error: "Game not found" });

    const isPlayer1 = game.player1Id === currentUserId;
    const isPlayer2 = game.player2Id === currentUserId;
    if (!isPlayer1 && !isPlayer2) {
      return res
        .status(403)
        .json({ error: "You are not a player in this game" });
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
      .where(
        or(
          eq(games.player1Id, currentUserId),
          eq(games.player2Id, currentUserId)
        )
      )
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
      (g) =>
        g.status === "completed" ||
        g.status === "declined" ||
        g.status === "forfeited"
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

    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (!game) return res.status(404).json({ error: "Game not found" });

    if (game.player1Id !== currentUserId && game.player2Id !== currentUserId) {
      return res
        .status(403)
        .json({ error: "You are not a player in this game" });
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
      (t) =>
        t.result === "pending" &&
        t.turnType === "set" &&
        t.playerId !== currentUserId
    );
    const needsToJudge =
      game.turnPhase === "judge" && game.currentTurn === currentUserId;
    const needsToRespond =
      game.turnPhase === "respond_trick" &&
      game.currentTurn === currentUserId;

    const isPlayer1 = game.player1Id === currentUserId;
    const canDispute = isPlayer1
      ? !game.player1DisputeUsed
      : !game.player2DisputeUsed;

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

// ============================================================================
// Auto-forfeit expired games (called by cron)
// ============================================================================

export async function forfeitExpiredGames(): Promise<{ forfeited: number }> {
  if (!isDatabaseAvailable()) {
    return { forfeited: 0 };
  }

  try {
    const db = getDb();
    const now = new Date();

    const expiredGames = await db
      .select()
      .from(games)
      .where(and(eq(games.status, "active"), lt(games.deadlineAt!, now)));

    let forfeitedCount = 0;

    for (const game of expiredGames) {
      const loserId = game.currentTurn;
      const winnerId =
        loserId === game.player1Id ? game.player2Id : game.player1Id;

      await db
        .update(games)
        .set({
          status: "forfeited",
          winnerId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(games.id, game.id));

      // Notify both players (push + email + in-app)
      for (const playerId of [game.player1Id, game.player2Id]) {
        if (!playerId) continue;
        await sendGameNotificationToUser(playerId, "game_forfeited_timeout", {
          gameId: game.id,
          loserId: loserId || undefined,
          winnerId: winnerId || undefined,
        });
      }

      logger.info("[Games] Game forfeited due to timeout", {
        gameId: game.id,
        loserId,
        winnerId,
      });

      forfeitedCount++;
    }

    return { forfeited: forfeitedCount };
  } catch (error) {
    logger.error("[Games] Failed to forfeit expired games", { error });
    return { forfeited: 0 };
  }
}

// ============================================================================
// Deadline warning check (called by cron — notifies players with ≤1 hour left)
// ============================================================================

export async function notifyDeadlineWarnings(): Promise<{
  notified: number;
}> {
  if (!isDatabaseAvailable()) {
    return { notified: 0 };
  }

  try {
    const db = getDb();
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Find active games where deadline is within 1 hour
    const urgentGames = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.status, "active"),
          lt(games.deadlineAt!, oneHourFromNow)
        )
      );

    let notifiedCount = 0;

    for (const game of urgentGames) {
      if (!game.currentTurn || !game.deadlineAt) continue;
      // Only notify if deadline is in the future (not already expired)
      if (new Date(game.deadlineAt) <= now) continue;

      // Dedup: skip if we already warned this game within the cooldown period
      const lastWarning = deadlineWarningsSent.get(game.id);
      if (lastWarning && now.getTime() - lastWarning < DEADLINE_WARNING_COOLDOWN_MS) {
        continue;
      }

      await sendGameNotificationToUser(game.currentTurn, "deadline_warning", {
        gameId: game.id,
        minutesRemaining: Math.round(
          (new Date(game.deadlineAt).getTime() - now.getTime()) / 60000
        ),
      });
      deadlineWarningsSent.set(game.id, now.getTime());
      notifiedCount++;
    }

    // Clean up old entries from the dedup map
    for (const [gameId, timestamp] of deadlineWarningsSent) {
      if (now.getTime() - timestamp > TURN_DEADLINE_MS) {
        deadlineWarningsSent.delete(gameId);
      }
    }

    return { notified: notifiedCount };
  } catch (error) {
    logger.error("[Games] Failed to send deadline warnings", { error });
    return { notified: 0 };
  }
}

export { router as gamesRouter };
