/**
 * Battle State Service — Core Vote Operations
 *
 * Manages battle voting using PostgreSQL row-level locking.
 *
 * Features:
 * - Vote state initialization per battle
 * - Vote casting with participant verification & deadline checking
 * - Idempotency via event ID tracking
 * - Double-vote handling (update existing)
 * - Winner calculation with tie-breaker (creator wins)
 */

import { getDb } from "../../db";
import { battles, battleVotes, battleVoteState } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../../logger";
import { logServerEvent } from "../analyticsService";
import { MAX_PROCESSED_EVENTS } from "./idempotency";
import { calculateWinner } from "./calculation";
import type { BattleVoteStateData, VoteResult } from "./types";

/** Vote timeout in milliseconds (60 seconds, then defender wins) */
const VOTE_TIMEOUT_MS = 60 * 1000;

// ============================================================================
// Initialize Voting
// ============================================================================

/**
 * Initialize voting state for a battle
 */
export async function initializeVoting(input: {
  eventId: string;
  battleId: string;
  creatorId: string;
  opponentId: string;
}): Promise<{ success: boolean; error?: string; alreadyInitialized?: boolean }> {
  const { eventId, battleId, creatorId, opponentId } = input;

  try {
    const db = getDb();
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      // Check if voting state already exists (with lock)
      const [existing] = await tx
        .select()
        .from(battleVoteState)
        .where(eq(battleVoteState.battleId, battleId))
        .for("update");

      if (existing) {
        const processedIds = existing.processedEventIds as string[];
        if (processedIds.includes(eventId)) {
          return { alreadyInitialized: true };
        }
        logger.warn("[BattleState] Voting already initialized, skipping", {
          battleId,
          existingStatus: existing.status,
        });
        return { alreadyInitialized: true };
      }

      // Create new voting state
      await tx.insert(battleVoteState).values({
        battleId,
        creatorId,
        opponentId,
        status: "voting",
        votes: [],
        votingStartedAt: now,
        voteDeadlineAt: new Date(now.getTime() + VOTE_TIMEOUT_MS),
        processedEventIds: [eventId],
        createdAt: now,
        updatedAt: now,
      });

      return { alreadyInitialized: false };
    });

    // Update battle status
    await db
      .update(battles)
      .set({ status: "voting", updatedAt: now })
      .where(eq(battles.id, battleId));

    if (result.alreadyInitialized) {
      logger.info("[BattleState] Voting already initialized (idempotent)", { battleId });
    } else {
      logger.info("[BattleState] Voting initialized", { battleId, creatorId, opponentId });
    }

    return { success: true, alreadyInitialized: result.alreadyInitialized };
  } catch (error) {
    logger.error("[BattleState] Failed to initialize voting", { error, battleId });
    return { success: false, error: "Failed to initialize voting" };
  }
}

// ============================================================================
// Cast Vote
// ============================================================================

/**
 * Cast a vote with idempotency and double-vote protection
 */
export async function castVote(input: {
  eventId: string;
  battleId: string;
  odv: string;
  vote: "clean" | "sketch" | "redo";
}): Promise<VoteResult> {
  const { eventId, battleId, odv, vote } = input;

  try {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      // Lock the vote state row
      const [state] = await tx
        .select()
        .from(battleVoteState)
        .where(eq(battleVoteState.battleId, battleId))
        .for("update");

      if (!state) {
        // Fallback: vote directly to DB without vote state
        return await castVoteLegacy(input);
      }

      const processedIds = state.processedEventIds as string[];
      const currentVotes = state.votes as BattleVoteStateData["votes"];

      // Check idempotency
      if (processedIds.includes(eventId)) {
        return {
          success: true,
          alreadyProcessed: true,
          battleComplete: state.status === "completed",
          winnerId: state.winnerId ?? undefined,
        };
      }

      if (state.status !== "voting") {
        return { success: false, error: "Voting is not active" };
      }

      if (state.voteDeadlineAt && new Date() > state.voteDeadlineAt) {
        return { success: false, error: "Voting deadline has passed" };
      }

      if (odv !== state.creatorId && odv !== state.opponentId) {
        return { success: false, error: "Not a participant in this battle" };
      }

      // Handle double vote (update existing)
      const existingVoteIndex = currentVotes.findIndex((v) => v.odv === odv);
      const now = new Date().toISOString();

      let updatedVotes: BattleVoteStateData["votes"];
      if (existingVoteIndex !== -1) {
        updatedVotes = currentVotes.map((v, i) =>
          i === existingVoteIndex ? { odv, vote, votedAt: now } : v
        );
        logger.info("[BattleState] Vote updated", { battleId, odv, vote });
      } else {
        updatedVotes = [...currentVotes, { odv, vote, votedAt: now }];
      }

      const updatedProcessedIds = [...processedIds, eventId].slice(-MAX_PROCESSED_EVENTS);

      const creatorVoted = updatedVotes.some((v) => v.odv === state.creatorId);
      const opponentVoted = updatedVotes.some((v) => v.odv === state.opponentId);
      const bothVoted = creatorVoted && opponentVoted;

      if (bothVoted && state.opponentId) {
        const { winnerId, scores } = calculateWinner(
          updatedVotes,
          state.creatorId,
          state.opponentId
        );

        await tx
          .update(battleVoteState)
          .set({
            votes: updatedVotes,
            status: "completed",
            winnerId,
            processedEventIds: updatedProcessedIds,
            updatedAt: new Date(),
          })
          .where(eq(battleVoteState.battleId, battleId));

        return {
          success: true,
          battleComplete: true,
          winnerId,
          finalScore: scores,
        };
      } else {
        await tx
          .update(battleVoteState)
          .set({
            votes: updatedVotes,
            processedEventIds: updatedProcessedIds,
            updatedAt: new Date(),
          })
          .where(eq(battleVoteState.battleId, battleId));

        return { success: true, battleComplete: false };
      }
    });

    // Persist vote to battleVotes table
    if (result.success && !result.alreadyProcessed) {
      await db
        .insert(battleVotes)
        .values({ battleId, odv, vote })
        .onConflictDoUpdate({
          target: [battleVotes.battleId, battleVotes.odv],
          set: { vote },
        });

      await logServerEvent(odv, "battle_voted", { battle_id: battleId, vote });

      if (result.battleComplete && result.winnerId) {
        await db
          .update(battles)
          .set({
            status: "completed",
            winnerId: result.winnerId,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(battles.id, battleId));

        await logServerEvent(result.winnerId, "battle_completed", {
          battle_id: battleId,
          winner_id: result.winnerId,
        });
      }
    }

    return result;
  } catch (error) {
    logger.error("[BattleState] Failed to cast vote", { error, battleId, odv });
    return { success: false, error: "Failed to cast vote" };
  }
}

// ============================================================================
// Legacy Vote (no vote-state row)
// ============================================================================

/**
 * Legacy vote casting for backwards compatibility (no vote state row)
 */
async function castVoteLegacy(input: {
  eventId: string;
  battleId: string;
  odv: string;
  vote: "clean" | "sketch" | "redo";
}): Promise<VoteResult> {
  const { battleId, odv, vote } = input;

  const db = getDb();

  const [battle] = await db.select().from(battles).where(eq(battles.id, battleId));
  if (!battle) {
    return { success: false, error: "Battle not found" };
  }

  if (odv !== battle.creatorId && odv !== battle.opponentId) {
    return { success: false, error: "Not a participant" };
  }

  await db
    .insert(battleVotes)
    .values({ battleId, odv, vote })
    .onConflictDoUpdate({
      target: [battleVotes.battleId, battleVotes.odv],
      set: { vote },
    });

  await logServerEvent(odv, "battle_voted", { battle_id: battleId, vote });

  const votes = await db.select().from(battleVotes).where(eq(battleVotes.battleId, battleId));

  const creatorVoted = votes.some((v) => v.odv === battle.creatorId);
  const opponentVoted = battle.opponentId && votes.some((v) => v.odv === battle.opponentId);

  if (creatorVoted && opponentVoted && battle.opponentId) {
    const voteData = votes.map((v) => ({
      odv: v.odv,
      vote: v.vote as "clean" | "sketch" | "redo",
      votedAt: v.createdAt?.toISOString() || new Date().toISOString(),
    }));

    const { winnerId, scores } = calculateWinner(voteData, battle.creatorId, battle.opponentId);

    await db
      .update(battles)
      .set({
        status: "completed",
        winnerId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(battles.id, battleId));

    await logServerEvent(winnerId || battle.creatorId, "battle_completed", {
      battle_id: battleId,
      winner_id: winnerId,
    });

    return {
      success: true,
      battleComplete: true,
      winnerId,
      finalScore: scores,
    };
  }

  return { success: true, battleComplete: false };
}

// ============================================================================
// Query
// ============================================================================

/**
 * Get battle vote state
 */
export async function getBattleVoteState(battleId: string): Promise<BattleVoteStateData | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(battleVoteState)
      .where(eq(battleVoteState.battleId, battleId));

    if (!row) return null;

    return {
      battleId: row.battleId,
      creatorId: row.creatorId,
      opponentId: row.opponentId,
      status: row.status as BattleVoteStateData["status"],
      votes: row.votes as BattleVoteStateData["votes"],
      votingStartedAt: row.votingStartedAt?.toISOString(),
      voteDeadlineAt: row.voteDeadlineAt?.toISOString(),
      winnerId: row.winnerId ?? undefined,
      processedEventIds: row.processedEventIds as string[],
    };
  } catch (error) {
    logger.error("[BattleState] Failed to get vote state", { error, battleId });
    return null;
  }
}
