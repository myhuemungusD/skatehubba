/**
 * Battle State Service
 *
 * Handles battle voting using PostgreSQL with row-level locking.
 *
 * Features:
 * - Vote timeouts (60 seconds, defender wins on timeout)
 * - Tie handling (creator wins on tie as the challenger)
 * - Idempotency keys to prevent duplicate votes
 * - Double-vote protection
 * - SELECT FOR UPDATE for distributed locking
 */

import { getDb } from "../db";
import { battles, battleVotes, battleVoteState } from "@shared/schema";
import { eq, and, lt } from "drizzle-orm";
import crypto from "node:crypto";
import logger from "../logger";
import { logServerEvent } from "./analyticsService";

// ============================================================================
// Types
// ============================================================================

export interface BattleVoteStateData {
  battleId: string;
  creatorId: string;
  opponentId: string | null;
  status: "waiting" | "active" | "voting" | "completed";
  votes: {
    odv: string;
    vote: "clean" | "sketch" | "redo";
    votedAt: string;
  }[];
  votingStartedAt?: string;
  voteDeadlineAt?: string;
  winnerId?: string;
  processedEventIds: string[];
}

interface VoteResult {
  success: boolean;
  error?: string;
  alreadyProcessed?: boolean;
  battleComplete?: boolean;
  winnerId?: string;
  finalScore?: Record<string, number>;
}

// ============================================================================
// Constants
// ============================================================================

const VOTE_TIMEOUT_MS = 60 * 1000; // 60 seconds to vote
const MAX_PROCESSED_EVENTS = 50;

// ============================================================================
// Helper Functions
// ============================================================================

function generateEventId(
  type: string,
  odv: string,
  battleId: string,
  sequenceKey?: string
): string {
  if (sequenceKey) {
    return `${type}-${battleId}-${odv}-${sequenceKey}`;
  }
  return `${type}-${battleId}-${odv}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

// ============================================================================
// Vote State Management
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

      if (bothVoted) {
        const { winnerId, scores } = calculateWinner(
          updatedVotes,
          state.creatorId,
          state.opponentId!
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

/**
 * Calculate winner with proper tie handling
 */
function calculateWinner(
  votes: { odv: string; vote: "clean" | "sketch" | "redo" }[],
  creatorId: string,
  opponentId: string
): { winnerId: string; scores: Record<string, number> } {
  const scores: Record<string, number> = {
    [creatorId]: 0,
    [opponentId]: 0,
  };

  for (const v of votes) {
    if (v.vote === "clean") {
      const otherPlayer = v.odv === creatorId ? opponentId : creatorId;
      scores[otherPlayer] = (scores[otherPlayer] || 0) + 1;
    }
  }

  const creatorScore = scores[creatorId];
  const opponentScore = scores[opponentId];

  let winnerId: string;
  if (creatorScore > opponentScore) {
    winnerId = creatorId;
  } else if (opponentScore > creatorScore) {
    winnerId = opponentId;
  } else {
    winnerId = creatorId;
    logger.info("[BattleState] Tie resolved - creator wins", {
      creatorId,
      opponentId,
      scores,
    });
  }

  return { winnerId, scores };
}

/**
 * Process vote timeouts
 */
export async function processVoteTimeouts(): Promise<void> {
  try {
    const db = getDb();
    const now = new Date();

    // Find voting states with expired deadlines
    const expiredStates = await db
      .select()
      .from(battleVoteState)
      .where(and(eq(battleVoteState.status, "voting"), lt(battleVoteState.voteDeadlineAt, now)));

    for (const state of expiredStates) {
      const sequenceKey = `deadline-${state.voteDeadlineAt?.toISOString()}`;
      const eventId = generateEventId("timeout", state.battleId, state.battleId, sequenceKey);

      const updated = await db.transaction(async (tx) => {
        const [fresh] = await tx
          .select()
          .from(battleVoteState)
          .where(eq(battleVoteState.battleId, state.battleId))
          .for("update");

        if (!fresh) return false;

        const processedIds = fresh.processedEventIds as string[];
        if (processedIds.includes(eventId)) return false;
        if (fresh.status !== "voting") return false;

        const currentVotes = fresh.votes as BattleVoteStateData["votes"];
        const creatorVoted = currentVotes.some((v) => v.odv === fresh.creatorId);
        const opponentVoted =
          fresh.opponentId && currentVotes.some((v) => v.odv === fresh.opponentId);

        let winnerId: string;
        let reason: string;

        if (creatorVoted && !opponentVoted) {
          winnerId = fresh.creatorId;
          reason = "opponent_timeout";
        } else if (!creatorVoted && opponentVoted && fresh.opponentId) {
          winnerId = fresh.opponentId;
          reason = "creator_timeout";
        } else {
          winnerId = fresh.creatorId;
          reason = "both_timeout";
        }

        await tx
          .update(battleVoteState)
          .set({
            status: "completed",
            winnerId,
            processedEventIds: [...processedIds, eventId].slice(-MAX_PROCESSED_EVENTS),
            updatedAt: now,
          })
          .where(eq(battleVoteState.battleId, state.battleId));

        return { winnerId, reason };
      });

      if (!updated) continue;

      // Update battles table
      await db
        .update(battles)
        .set({
          status: "completed",
          winnerId: updated.winnerId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(battles.id, state.battleId));

      await logServerEvent(updated.winnerId, "battle_completed", {
        battle_id: state.battleId,
        winner_id: updated.winnerId,
        completion_reason: updated.reason,
      });

      logger.info("[BattleState] Vote timeout processed", {
        battleId: state.battleId,
        winnerId: updated.winnerId,
        reason: updated.reason,
      });
    }
  } catch (error) {
    logger.error("[BattleState] Failed to process vote timeouts", { error });
  }
}

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

// ============================================================================
// Exports
// ============================================================================

export { generateEventId };
