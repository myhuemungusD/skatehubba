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
import { sendGameNotification } from "../services/gameNotificationService";

const router = Router();

// ============================================================================
// Constants
// ============================================================================

const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_VIDEO_DURATION_MS = 15_000; // 15 seconds hard cap
const SKATE_LETTERS = "SKATE";

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

async function getUserPushToken(
  db: ReturnType<typeof getDb>,
  userId: string
): Promise<string | null> {
  const result = await db
    .select({ pushToken: customUsers.pushToken })
    .from(customUsers)
    .where(eq(customUsers.id, userId))
    .limit(1);
  return result[0]?.pushToken ?? null;
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

    // Notify opponent
    const pushToken = await getUserPushToken(db, opponentId);
    if (pushToken) {
      await sendGameNotification(pushToken, "challenge_received", {
        gameId: newGame.id,
        challengerName: player1Name,
      });
    }

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
      const pushToken = await getUserPushToken(db, game.player1Id);
      if (pushToken) {
        await sendGameNotification(pushToken, "your_turn", {
          gameId,
          opponentName: game.player2Name || "Opponent",
        });
      }

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
    if (game.currentTurn !== currentUserId) {
      return res.status(400).json({ error: "Not your turn" });
    }

    // Check deadline
    if (game.deadlineAt && new Date(game.deadlineAt) < new Date()) {
      return res.status(400).json({ error: "Turn deadline has passed. Game forfeited." });
    }

    // Determine turn type based on phase
    const turnPhase = game.turnPhase || "set_trick";
    let turnType: "set" | "response";

    if (turnPhase === "set_trick") {
      // Must be the offensive player
      if (currentUserId !== game.offensivePlayerId) {
        return res
          .status(400)
          .json({ error: "Only the offensive player can set a trick" });
      }
      turnType = "set";
    } else if (turnPhase === "respond_trick") {
      // Must be the defensive player
      if (currentUserId !== game.defensivePlayerId) {
        return res
          .status(400)
          .json({ error: "Only the defensive player can respond" });
      }
      turnType = "response";
    } else {
      return res
        .status(400)
        .json({ error: "Current phase does not accept video submissions" });
    }

    // Get turn count
    const turnCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gameTurns)
      .where(eq(gameTurns.gameId, gameId));

    const turnNumber = (turnCountResult[0]?.count || 0) + 1;
    const playerName = isPlayer1
      ? game.player1Name
      : game.player2Name;

    // Create the turn record
    const [newTurn] = await db
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
      // Offensive player set a trick → move to respond_trick phase
      // Defensive player's turn now
      await db
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

      // Notify defender: "Your turn."
      if (game.defensivePlayerId) {
        const pushToken = await getUserPushToken(db, game.defensivePlayerId);
        if (pushToken) {
          await sendGameNotification(pushToken, "your_turn", {
            gameId,
            opponentName: playerName || "Opponent",
          });
        }
      }

      logger.info("[Games] Set trick submitted", {
        gameId,
        turnId: newTurn.id,
        playerId: currentUserId,
      });

      res.status(201).json({
        turn: newTurn,
        message: "Trick set. Sent.",
      });
    } else {
      // Defensive player responded → move to judge phase
      // Defensive player judges the offensive trick
      await db
        .update(games)
        .set({
          currentTurn: game.defensivePlayerId, // same player judges
          turnPhase: "judge",
          deadlineAt: deadline,
          updatedAt: now,
        })
        .where(eq(games.id, gameId));

      logger.info("[Games] Response submitted", {
        gameId,
        turnId: newTurn.id,
        playerId: currentUserId,
      });

      res.status(201).json({
        turn: newTurn,
        message: "Response sent. Now judge the trick.",
      });
    }
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

    // Get the turn being judged (must be the offensive "set" turn)
    const [turn] = await db
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.id, turnId))
      .limit(1);

    if (!turn) return res.status(404).json({ error: "Turn not found" });

    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, turn.gameId))
      .limit(1);

    if (!game) return res.status(404).json({ error: "Game not found" });

    // Only the defensive player can judge
    if (currentUserId !== game.defensivePlayerId) {
      return res
        .status(403)
        .json({ error: "Only the defending player can judge" });
    }

    // Must be in judge phase
    if (game.turnPhase !== "judge") {
      return res
        .status(400)
        .json({ error: "Game is not in judging phase" });
    }

    // Must be the judge's turn
    if (game.currentTurn !== currentUserId) {
      return res.status(400).json({ error: "Not your turn to judge" });
    }

    // Turn must be pending
    if (turn.result !== "pending") {
      return res.status(400).json({ error: "Turn has already been judged" });
    }

    // Verify defender has submitted their response video
    const responseVideos = await db
      .select()
      .from(gameTurns)
      .where(
        and(
          eq(gameTurns.gameId, game.id),
          eq(gameTurns.playerId, currentUserId),
          eq(gameTurns.turnType, "response")
        )
      );

    // Check there's a response video for THIS round (after the set trick)
    const hasResponseForThisRound = responseVideos.some(
      (rv) => rv.turnNumber > turn.turnNumber
    );

    if (!hasResponseForThisRound) {
      return res
        .status(400)
        .json({ error: "You must submit your response video before judging" });
    }

    const now = new Date();

    // Update the turn with judgment
    await db
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
      // Roles stay: same offensive/defensive
      newOffensiveId = game.offensivePlayerId!;
      newDefensiveId = game.defensivePlayerId!;
    } else {
      // LAND: roles swap
      newOffensiveId = game.defensivePlayerId!;
      newDefensiveId = game.offensivePlayerId!;
    }

    const gameOver = isGameOver(newPlayer1Letters, newPlayer2Letters);
    const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

    if (gameOver.over) {
      const winnerId =
        gameOver.loserId === "player1" ? game.player2Id : game.player1Id;

      const [updatedGame] = await db
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

      // Notify both players: game over
      for (const playerId of [game.player1Id, game.player2Id]) {
        if (!playerId) continue;
        const pushToken = await getUserPushToken(db, playerId);
        if (pushToken) {
          await sendGameNotification(pushToken, "game_over", {
            gameId: game.id,
            winnerId: winnerId || undefined,
            youWon: playerId === winnerId,
          });
        }
      }

      logger.info("[Games] Game completed", {
        gameId: game.id,
        winnerId,
        player1Letters: newPlayer1Letters,
        player2Letters: newPlayer2Letters,
      });

      res.json({
        game: updatedGame,
        turn: { ...turn, result, judgedBy: currentUserId, judgedAt: now },
        gameOver: true,
        winnerId,
        message: "Game over.",
      });
    } else {
      // Game continues — offensive player sets next trick
      const [updatedGame] = await db
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

      // Notify the next offensive player: your turn
      const pushToken = await getUserPushToken(db, newOffensiveId);
      if (pushToken) {
        const oppName = isPlayer1 ? game.player2Name : game.player1Name;
        await sendGameNotification(pushToken, "your_turn", {
          gameId: game.id,
          opponentName: oppName || "Opponent",
        });
      }

      const letterMessage =
        result === "missed" ? "BAIL. Letter earned." : "LAND. Roles swap.";

      logger.info("[Games] Turn judged", {
        gameId: game.id,
        turnId,
        result,
        judgedBy: currentUserId,
      });

      res.json({
        game: updatedGame,
        turn: { ...turn, result, judgedBy: currentUserId, judgedAt: now },
        gameOver: false,
        message: letterMessage,
      });
    }
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

    // Check if player has already used their dispute
    const disputeUsed = isPlayer1
      ? game.player1DisputeUsed
      : game.player2DisputeUsed;
    if (disputeUsed) {
      return res
        .status(400)
        .json({ error: "You have already used your dispute for this game" });
    }

    // Get the turn being disputed
    const [turn] = await db
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.id, turnId))
      .limit(1);

    if (!turn) return res.status(404).json({ error: "Turn not found" });
    if (turn.gameId !== gameId) {
      return res.status(400).json({ error: "Turn does not belong to this game" });
    }

    // Can only dispute a BAIL (missed) judgment
    if (turn.result !== "missed") {
      return res
        .status(400)
        .json({ error: "Can only dispute a BAIL judgment" });
    }

    // The disputer must be the player who was judged (the offensive player)
    if (turn.playerId !== currentUserId) {
      return res
        .status(400)
        .json({ error: "You can only dispute judgments on your own tricks" });
    }

    // Must have been judged
    if (!turn.judgedBy) {
      return res.status(400).json({ error: "Turn has not been judged yet" });
    }

    // Mark dispute as used
    const disputeField = isPlayer1
      ? { player1DisputeUsed: true }
      : { player2DisputeUsed: true };

    await db.update(games).set(disputeField).where(eq(games.id, gameId));

    // Create dispute record
    const [dispute] = await db
      .insert(gameDisputes)
      .values({
        gameId,
        turnId,
        disputedBy: currentUserId,
        againstPlayerId: turn.judgedBy,
        originalResult: "missed",
      })
      .returning();

    logger.info("[Games] Dispute filed", {
      gameId,
      turnId,
      disputeId: dispute.id,
      disputedBy: currentUserId,
    });

    // Notify opponent about the dispute
    const opponentId = isPlayer1 ? game.player2Id : game.player1Id;
    if (opponentId) {
      const pushToken = await getUserPushToken(db, opponentId);
      if (pushToken) {
        await sendGameNotification(pushToken, "dispute_filed", {
          gameId,
          disputeId: dispute.id,
        });
      }
    }

    res.status(201).json({
      dispute,
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

      const [dispute] = await db
        .select()
        .from(gameDisputes)
        .where(eq(gameDisputes.id, disputeId))
        .limit(1);

      if (!dispute) return res.status(404).json({ error: "Dispute not found" });
      if (dispute.finalResult) {
        return res.status(400).json({ error: "Dispute already resolved" });
      }

      // Only the player who was disputed against can resolve
      if (dispute.againstPlayerId !== currentUserId) {
        return res
          .status(403)
          .json({ error: "Only the judging player can resolve the dispute" });
      }

      const [game] = await db
        .select()
        .from(games)
        .where(eq(games.id, dispute.gameId))
        .limit(1);

      if (!game) return res.status(404).json({ error: "Game not found" });

      const now = new Date();

      // Determine who gets penalized based on outcome
      let penaltyTarget: string;
      if (finalResult === "landed") {
        // Dispute upheld (overturned to LAND) → the original judger acted in bad faith
        penaltyTarget = dispute.againstPlayerId;
      } else {
        // Dispute denied (BAIL upheld) → the disputer filed a bad-faith dispute
        penaltyTarget = dispute.disputedBy;
      }

      // Resolve the dispute
      await db
        .update(gameDisputes)
        .set({
          finalResult,
          resolvedBy: currentUserId,
          resolvedAt: now,
          penaltyAppliedTo: penaltyTarget,
        })
        .where(eq(gameDisputes.id, disputeId));

      // Apply permanent reputation penalty
      await db
        .update(userProfiles)
        .set({
          disputePenalties: sql`${userProfiles.disputePenalties} + 1`,
        })
        .where(eq(userProfiles.id, penaltyTarget));

      // If overturned to LAND, reverse the letter from the defender
      // BAIL means defender failed to match → defender got the letter
      // The defender is dispute.againstPlayerId (the one who judged)
      if (finalResult === "landed") {
        const defenderIsPlayer1 = game.player1Id === dispute.againstPlayerId;

        if (defenderIsPlayer1) {
          const currentLetters = game.player1Letters || "";
          if (currentLetters.length > 0) {
            await db
              .update(games)
              .set({
                player1Letters: currentLetters.slice(0, -1),
                updatedAt: now,
              })
              .where(eq(games.id, game.id));
          }
        } else {
          const currentLetters = game.player2Letters || "";
          if (currentLetters.length > 0) {
            await db
              .update(games)
              .set({
                player2Letters: currentLetters.slice(0, -1),
                updatedAt: now,
              })
              .where(eq(games.id, game.id));
          }
        }

        // Update the turn result to landed
        await db
          .update(gameTurns)
          .set({ result: "landed" })
          .where(eq(gameTurns.id, dispute.turnId));
      }

      logger.info("[Games] Dispute resolved", {
        disputeId,
        finalResult,
        penaltyTarget,
      });

      res.json({
        dispute: {
          ...dispute,
          finalResult,
          resolvedBy: currentUserId,
          resolvedAt: now,
          penaltyAppliedTo: penaltyTarget,
        },
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

    // Notify opponent
    if (winnerId) {
      const pushToken = await getUserPushToken(db, winnerId);
      if (pushToken) {
        await sendGameNotification(pushToken, "opponent_forfeited", {
          gameId,
        });
      }
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

      // Notify both players
      for (const playerId of [game.player1Id, game.player2Id]) {
        if (!playerId) continue;
        const pushToken = await getUserPushToken(db, playerId);
        if (pushToken) {
          await sendGameNotification(pushToken, "game_forfeited_timeout", {
            gameId: game.id,
            loserId: loserId || undefined,
            winnerId: winnerId || undefined,
          });
        }
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

      const pushToken = await getUserPushToken(db, game.currentTurn);
      if (pushToken) {
        await sendGameNotification(pushToken, "deadline_warning", {
          gameId: game.id,
          minutesRemaining: Math.round(
            (new Date(game.deadlineAt).getTime() - now.getTime()) / 60000
          ),
        });
        notifiedCount++;
      }
    }

    return { notified: notifiedCount };
  } catch (error) {
    logger.error("[Games] Failed to send deadline warnings", { error });
    return { notified: 0 };
  }
}

export { router as gamesRouter };
