/**
 * Game Dispute Service - S.K.A.T.E. dispute filing and resolution
 *
 * Extracted from route handlers to keep business logic testable
 * and route handlers thin (HTTP concerns only).
 */

import { games, gameTurns, gameDisputes, userProfiles } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { TURN_DEADLINE_MS } from "../routes/games-shared";
import type { Database } from "../db";

// ============================================================================
// Types
// ============================================================================

type TxError = { ok: false; status: number; error: string };

type FileDisputeSuccess = {
  ok: true;
  dispute: typeof gameDisputes.$inferSelect;
  opponentId: string | null;
};

type ResolveDisputeSuccess = {
  ok: true;
  dispute: Record<string, unknown>;
  penaltyTarget: string;
};

export type FileDisputeResult = TxError | FileDisputeSuccess;
export type ResolveDisputeResult = TxError | ResolveDisputeSuccess;

// ============================================================================
// File Dispute
// ============================================================================

/**
 * File a dispute against a BAIL judgment within a transaction.
 * Validates eligibility (1 per player per game, bail-only),
 * marks the dispute as used, and creates the dispute record.
 */
export async function fileDispute(
  tx: Database,
  gameId: string,
  playerId: string,
  turnId: number
): Promise<FileDisputeResult> {
  // Lock game row
  await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);

  const [game] = await tx.select().from(games).where(eq(games.id, gameId)).limit(1);

  if (!game) return { ok: false, status: 404, error: "Game not found" };

  const isPlayer1 = game.player1Id === playerId;
  const isPlayer2 = game.player2Id === playerId;
  if (!isPlayer1 && !isPlayer2)
    return { ok: false, status: 403, error: "You are not a player in this game" };
  if (game.status !== "active") return { ok: false, status: 400, error: "Game is not active" };

  const disputeUsed = isPlayer1 ? game.player1DisputeUsed : game.player2DisputeUsed;
  if (disputeUsed)
    return { ok: false, status: 400, error: "You have already used your dispute for this game" };

  // Get the turn being disputed
  const [turn] = await tx.select().from(gameTurns).where(eq(gameTurns.id, turnId)).limit(1);

  if (!turn) return { ok: false, status: 404, error: "Turn not found" };
  if (turn.gameId !== gameId)
    return { ok: false, status: 400, error: "Turn does not belong to this game" };
  if (turn.result !== "missed")
    return { ok: false, status: 400, error: "Can only dispute a BAIL judgment" };
  if (turn.playerId !== playerId)
    return { ok: false, status: 400, error: "You can only dispute judgments on your own tricks" };
  if (!turn.judgedBy) return { ok: false, status: 400, error: "Turn has not been judged yet" };

  // Mark dispute as used + create dispute record atomically
  const disputeField = isPlayer1 ? { player1DisputeUsed: true } : { player2DisputeUsed: true };
  await tx.update(games).set(disputeField).where(eq(games.id, gameId));

  const [dispute] = await tx
    .insert(gameDisputes)
    .values({
      gameId,
      turnId,
      disputedBy: playerId,
      againstPlayerId: turn.judgedBy,
      originalResult: "missed",
    })
    .returning();

  const opponentId = isPlayer1 ? game.player2Id : game.player1Id;
  return { ok: true, dispute, opponentId };
}

// ============================================================================
// Resolve Dispute
// ============================================================================

/**
 * Resolve a dispute within a transaction.
 * Determines penalty target, applies reputation penalty,
 * and if overturned to LAND, reverses the letter and swaps roles.
 */
export async function resolveDispute(
  tx: Database,
  disputeId: number,
  playerId: string,
  finalResult: "landed" | "missed"
): Promise<ResolveDisputeResult> {
  // Lock dispute row to prevent double-resolution
  await tx.execute(sql`SELECT id FROM game_disputes WHERE id = ${disputeId} FOR UPDATE`);

  const [dispute] = await tx
    .select()
    .from(gameDisputes)
    .where(eq(gameDisputes.id, disputeId))
    .limit(1);

  if (!dispute) return { ok: false, status: 404, error: "Dispute not found" };
  if (dispute.finalResult) return { ok: false, status: 400, error: "Dispute already resolved" };
  if (dispute.againstPlayerId !== playerId)
    return { ok: false, status: 403, error: "Only the judging player can resolve the dispute" };

  // Lock game row too
  await tx.execute(sql`SELECT id FROM games WHERE id = ${dispute.gameId} FOR UPDATE`);

  const [game] = await tx.select().from(games).where(eq(games.id, dispute.gameId)).limit(1);

  if (!game) return { ok: false, status: 404, error: "Game not found" };
  if (game.status !== "active")
    return { ok: false, status: 400, error: "Game is no longer active" };

  const now = new Date();

  // Determine who gets penalized
  const penaltyTarget = finalResult === "landed" ? dispute.againstPlayerId : dispute.disputedBy;

  // Resolve the dispute
  await tx
    .update(gameDisputes)
    .set({
      finalResult,
      resolvedBy: playerId,
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
    const defenderIsPlayer1 = game.player1Id === dispute.disputedBy;
    const currentLetters = defenderIsPlayer1
      ? game.player1Letters || ""
      : game.player2Letters || "";

    const letterUpdate = defenderIsPlayer1
      ? { player1Letters: currentLetters.length > 0 ? currentLetters.slice(0, -1) : "" }
      : { player2Letters: currentLetters.length > 0 ? currentLetters.slice(0, -1) : "" };

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
    await tx.update(gameTurns).set({ result: "landed" }).where(eq(gameTurns.id, dispute.turnId));
  }

  return {
    ok: true,
    dispute: {
      ...dispute,
      finalResult,
      resolvedBy: playerId,
      resolvedAt: now,
      penaltyAppliedTo: penaltyTarget,
    },
    penaltyTarget,
  };
}
