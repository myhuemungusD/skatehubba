/**
 * S.K.A.T.E. Game Dispute Routes
 * Handles dispute filing and resolution
 */

import { Router } from "express";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import { games, gameTurns, gameDisputes, userProfiles } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";
import { disputeSchema, resolveDisputeSchema, TURN_DEADLINE_MS } from "./games-shared";

const router = Router();

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
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { turnId } = parsed.data;

  try {
    const db = getDb();

    // Transaction prevents concurrent dispute filings bypassing the 1-per-player limit
    const txResult = await db.transaction(async (tx) => {
      // Lock game row
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

      const disputeUsed = isPlayer1 ? game.player1DisputeUsed : game.player2DisputeUsed;
      if (disputeUsed)
        return {
          ok: false as const,
          status: 400,
          error: "You have already used your dispute for this game",
        };

      // Get the turn being disputed
      const [turn] = await tx.select().from(gameTurns).where(eq(gameTurns.id, turnId)).limit(1);

      if (!turn) return { ok: false as const, status: 404, error: "Turn not found" };
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
      const disputeField = isPlayer1 ? { player1DisputeUsed: true } : { player2DisputeUsed: true };

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

router.post("/disputes/:disputeId/resolve", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = resolveDisputeSchema.safeParse({
    ...req.body,
    disputeId: parseInt(req.params.disputeId, 10),
  });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const { disputeId, finalResult } = parsed.data;

  try {
    const db = getDb();

    // Transaction for atomicity: resolve dispute + apply penalty + swap roles
    const txResult = await db.transaction(async (tx) => {
      // Lock dispute row to prevent double-resolution
      await tx.execute(sql`SELECT id FROM game_disputes WHERE id = ${disputeId} FOR UPDATE`);

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
      await tx.execute(sql`SELECT id FROM games WHERE id = ${dispute.gameId} FOR UPDATE`);

      const [game] = await tx.select().from(games).where(eq(games.id, dispute.gameId)).limit(1);

      if (!game) return { ok: false as const, status: 404, error: "Game not found" };
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
        const defenderIsPlayer1 = game.player1Id === dispute.againstPlayerId;
        const currentLetters = defenderIsPlayer1
          ? game.player1Letters || ""
          : game.player2Letters || "";

        const letterUpdate = defenderIsPlayer1
          ? {
              player1Letters: currentLetters.length > 0 ? currentLetters.slice(0, -1) : "",
            }
          : {
              player2Letters: currentLetters.length > 0 ? currentLetters.slice(0, -1) : "",
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
});

export { router as gamesDisputesRouter };
