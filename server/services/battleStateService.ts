/**
 * Battle State Service
 *
 * Handles battle voting with:
 * - Vote timeouts (60 seconds, defender wins on timeout)
 * - Tie handling (creator wins on tie as the challenger)
 * - Idempotency keys to prevent duplicate votes
 * - Double-vote protection
 */

import { db } from "../db";
import { db as firestore } from "../firestore";
import { battles, battleVotes } from "../../packages/shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";
import { logServerEvent } from "./analyticsService";

// ============================================================================
// Types
// ============================================================================

export interface BattleVoteState {
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

function generateEventId(type: string, odv: string, battleId: string): string {
  return `${type}-${battleId}-${odv}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function getBattleStateRef(battleId: string) {
  return firestore.collection("battle_state").doc(battleId);
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
}): Promise<{ success: boolean; error?: string }> {
  const { eventId, battleId, creatorId, opponentId } = input;

  try {
    const now = new Date();
    
    // Use transaction to check if voting is already initialized
    const result = await firestore.runTransaction(async (transaction) => {
      const stateRef = getBattleStateRef(battleId);
      const snapshot = await transaction.get(stateRef);

      if (snapshot.exists) {
        const existing = snapshot.data() as BattleVoteState;

        // Idempotency: if this event already initialized voting, do nothing.
        if (Array.isArray(existing.processedEventIds) && existing.processedEventIds.includes(eventId)) {
          return { alreadyProcessed: true };
        }

        // Voting has already been initialized for this battle; avoid overwriting existing state.
        logger.warn("[BattleState] Voting already initialized, skipping re-initialization", {
          battleId,
          creatorId,
          opponentId,
        });
        return { alreadyInitialized: true };
      }

      const state: BattleVoteState = {
        battleId,
        creatorId,
        opponentId,
        status: "voting",
        votes: [],
        votingStartedAt: now.toISOString(),
        voteDeadlineAt: new Date(now.getTime() + VOTE_TIMEOUT_MS).toISOString(),
        processedEventIds: [eventId],
      };

      transaction.set(stateRef, state);
      return { initialized: true };
    });

    if (result.alreadyProcessed || result.alreadyInitialized) {
      return { success: true };
    }

    // Update database status
    if (db) {
      await db
        .update(battles)
        .set({ status: "voting", updatedAt: now })
        .where(eq(battles.id, battleId));
    }

    logger.info("[BattleState] Voting initialized", { battleId, creatorId, opponentId });
    return { success: true };
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
    const result = await firestore.runTransaction(async (transaction) => {
      const stateRef = getBattleStateRef(battleId);
      const stateDoc = await transaction.get(stateRef);

      // If no state exists, try to get from database and create state
      if (!stateDoc.exists) {
        // Fallback: vote directly to DB without Firestore state
        // This maintains backwards compatibility
        return await castVoteLegacy(input);
      }

      const state = stateDoc.data() as BattleVoteState;

      // Check idempotency
      if (state.processedEventIds.includes(eventId)) {
        return {
          success: true,
          alreadyProcessed: true,
          battleComplete: state.status === "completed",
          winnerId: state.winnerId,
        };
      }

      // Check if voting is still open
      if (state.status !== "voting") {
        return { success: false, error: "Voting is not active" };
      }

      // Check vote deadline
      if (state.voteDeadlineAt && new Date() > new Date(state.voteDeadlineAt)) {
        return { success: false, error: "Voting deadline has passed" };
      }

      // Check if player is a participant
      if (odv !== state.creatorId && odv !== state.opponentId) {
        return { success: false, error: "Not a participant in this battle" };
      }

      // Check for double vote (update existing vote instead)
      const existingVoteIndex = state.votes.findIndex((v) => v.odv === odv);
      const now = new Date().toISOString();

      let updatedVotes: BattleVoteState["votes"];
      if (existingVoteIndex !== -1) {
        // Update existing vote (allowed - user changed their mind)
        updatedVotes = state.votes.map((v, i) =>
          i === existingVoteIndex ? { odv, vote, votedAt: now } : v
        );
        logger.info("[BattleState] Vote updated", { battleId, odv, vote });
      } else {
        // New vote
        updatedVotes = [...state.votes, { odv, vote, votedAt: now }];
      }

      const processedEventIds = [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);

      // Check if both players have voted
      const creatorVoted = updatedVotes.some((v) => v.odv === state.creatorId);
      const opponentVoted = updatedVotes.some((v) => v.odv === state.opponentId);
      const bothVoted = creatorVoted && opponentVoted;

      if (bothVoted) {
        // Calculate winner with tie handling
        const { winnerId, scores } = calculateWinner(
          updatedVotes,
          state.creatorId,
          state.opponentId!
        );

        transaction.update(stateRef, {
          votes: updatedVotes,
          status: "completed",
          winnerId,
          processedEventIds,
        });

        return {
          success: true,
          battleComplete: true,
          winnerId,
          finalScore: scores,
        };
      } else {
        transaction.update(stateRef, {
          votes: updatedVotes,
          processedEventIds,
        });

        return { success: true, battleComplete: false };
      }
    });

    // Persist vote to database
    if (result.success && !result.alreadyProcessed && db) {
      await db
        .insert(battleVotes)
        .values({ battleId, odv, vote })
        .onConflictDoUpdate({
          target: [battleVotes.battleId, battleVotes.odv],
          set: { vote },
        });

      await logServerEvent(odv, "battle_voted", { battle_id: battleId, vote });

      // If battle complete, update database
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
 * Legacy vote casting for backwards compatibility
 */
async function castVoteLegacy(input: {
  eventId: string;
  battleId: string;
  odv: string;
  vote: "clean" | "sketch" | "redo";
}): Promise<VoteResult> {
  const { battleId, odv, vote } = input;

  if (!db) {
    return { success: false, error: "Database not available" };
  }

  // Get battle
  const [battle] = await db.select().from(battles).where(eq(battles.id, battleId));
  if (!battle) {
    return { success: false, error: "Battle not found" };
  }

  // Verify participant
  if (odv !== battle.creatorId && odv !== battle.opponentId) {
    return { success: false, error: "Not a participant" };
  }

  // Insert/update vote
  await db
    .insert(battleVotes)
    .values({ battleId, odv, vote })
    .onConflictDoUpdate({
      target: [battleVotes.battleId, battleVotes.odv],
      set: { vote },
    });

  await logServerEvent(odv, "battle_voted", { battle_id: battleId, vote });

  // Check if both voted
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
 * Tie-breaker: Creator (challenger) wins on tie, as they initiated the challenge
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

  // Each player votes on the OTHER player's trick
  // "clean" = the other player's trick was clean (point for them)
  for (const v of votes) {
    if (v.vote === "clean") {
      // Voter says other player's trick was clean
      const otherPlayer = v.odv === creatorId ? opponentId : creatorId;
      scores[otherPlayer] = (scores[otherPlayer] || 0) + 1;
    }
    // "sketch" and "redo" don't give points
  }

  // Determine winner
  const creatorScore = scores[creatorId];
  const opponentScore = scores[opponentId];

  let winnerId: string;
  if (creatorScore > opponentScore) {
    winnerId = creatorId;
  } else if (opponentScore > creatorScore) {
    winnerId = opponentId;
  } else {
    // Tie - creator wins as the challenger
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
 * Called periodically to check for expired voting deadlines
 */
export async function processVoteTimeouts(): Promise<void> {
  try {
    const now = new Date();
    const nowISO = now.toISOString();

    // Find battles in voting state with expired deadlines
    const votingBattlesQuery = await firestore
      .collection("battle_state")
      .where("status", "==", "voting")
      .where("voteDeadlineAt", "<", nowISO)
      .get();

    for (const doc of votingBattlesQuery.docs) {
      const state = doc.data() as BattleVoteState;

      // Determine winner based on timeout
      // Rule: The player who DID vote wins. If neither voted, creator wins.
      const creatorVoted = state.votes.some((v) => v.odv === state.creatorId);
      const opponentVoted = state.opponentId && state.votes.some((v) => v.odv === state.opponentId);

      let winnerId: string;
      let reason: string;

      if (creatorVoted && !opponentVoted) {
        // Opponent timed out - creator wins
        winnerId = state.creatorId;
        reason = "opponent_timeout";
      } else if (!creatorVoted && opponentVoted && state.opponentId) {
        // Creator timed out - opponent wins
        winnerId = state.opponentId;
        reason = "creator_timeout";
      } else {
        // Neither voted or both voted (shouldn't happen) - creator wins
        winnerId = state.creatorId;
        reason = "both_timeout";
      }

      const eventId = generateEventId("timeout", winnerId, state.battleId);

      // Atomically check idempotency and update battle state in a transaction
      const processedInThisRun = await firestore.runTransaction(async (tx) => {
        const battleRef = getBattleStateRef(state.battleId);
        const snapshot = await tx.get(battleRef);

        if (!snapshot.exists) {
          return false;
        }

        const currentState = snapshot.data() as BattleVoteState;
        const currentProcessedEventIds = currentState.processedEventIds || [];

        if (currentProcessedEventIds.includes(eventId)) {
          // Timeout for this eventId has already been processed
          return false;
        }

        const updatedProcessedEventIds = [...currentProcessedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);

        tx.update(battleRef, {
          status: "completed",
          winnerId,
          processedEventIds: updatedProcessedEventIds,
        });

        return true;
      });

      // If another process already handled this timeout, skip further processing
      if (!processedInThisRun) {
        continue;
      }

      // Update database
      if (db) {
        await db
          .update(battles)
          .set({
            status: "completed",
            winnerId,
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(battles.id, state.battleId));

        await logServerEvent(winnerId, "battle_completed", {
          battle_id: state.battleId,
          winner_id: winnerId,
          completion_reason: reason,
        });
      }

      logger.info("[BattleState] Vote timeout processed", {
        battleId: state.battleId,
        winnerId,
        reason,
      });
    }
  } catch (error) {
    logger.error("[BattleState] Failed to process vote timeouts", { error });
  }
}

/**
 * Get battle vote state
 */
export async function getBattleVoteState(battleId: string): Promise<BattleVoteState | null> {
  try {
    const doc = await getBattleStateRef(battleId).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as BattleVoteState;
  } catch (error) {
    logger.error("[BattleState] Failed to get vote state", { error, battleId });
    return null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export { generateEventId };
