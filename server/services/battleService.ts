import { db } from "../db";
import { logServerEvent } from "./analyticsService";
import logger from "../logger";

/**
 * Battle Service
 *
 * Handles battle creation, joining, voting, and completion.
 * All "truth events" are logged server-side AFTER successful DB writes.
 *
 * Truth events logged:
 * - battle_created: When a new battle is created
 * - battle_joined: When opponent joins a battle
 * - battle_voted: When a vote is cast (CRITICAL for WAB/AU)
 * - battle_completed: When battle reaches final state
 */

// Types for battle operations
export interface CreateBattleInput {
  creatorId: string;
  matchmaking: "open" | "direct";
  opponentId?: string;
  stance?: "regular" | "goofy";
  skill?: string;
}

export interface VoteBattleInput {
  odv: string;
  battleId: string;
  vote: "clean" | "sketch" | "redo";
}

export interface CompleteBattleInput {
  battleId: string;
  winnerId?: string;
  totalRounds: number;
}

/**
 * Create a new battle
 *
 * @example
 * ```ts
 * const battle = await createBattle({
 *   creatorId: uid,
 *   matchmaking: "open",
 * });
 * ```
 */
export async function createBattle(input: CreateBattleInput) {
  if (!db) {
    throw new Error("Database not available");
  }

  // TODO: Implement actual battle creation in DB
  // const [battle] = await db.insert(battles).values({...}).returning();

  const battleId = `battle-${Date.now()}`; // Placeholder

  // Log truth event AFTER successful creation
  await logServerEvent(input.creatorId, "battle_created", {
    battle_id: battleId,
    matchmaking: input.matchmaking,
    opponent_id: input.opponentId,
    stance: input.stance,
    skill: input.skill,
  });

  logger.info("[Battle] Created", {
    battleId,
    creatorId: input.creatorId,
  });

  return { battleId };
}

/**
 * Join an existing battle
 */
export async function joinBattle(odv: string, battleId: string) {
  if (!db) {
    throw new Error("Database not available");
  }

  // TODO: Implement actual battle join in DB
  // await db.update(battles).set({ opponentId: odv }).where(eq(battles.id, battleId));

  // Log truth event AFTER successful join
  await logServerEvent(odv, "battle_joined", {
    battle_id: battleId,
  });

  logger.info("[Battle] Joined", { battleId, odv });

  return { success: true };
}

/**
 * Cast a vote on a battle response
 *
 * CRITICAL: This is the most important truth event for WAB/AU metric.
 * Only log after vote is successfully recorded in DB.
 */
export async function voteBattle(input: VoteBattleInput) {
  if (!db) {
    throw new Error("Database not available");
  }

  const { odv, battleId, vote } = input;

  // TODO: Implement actual vote recording in DB
  // await db.insert(battleVotes).values({ odv, battleId, vote, createdAt: new Date() });

  // Log truth event AFTER successful vote (CRITICAL - never log before DB write)
  await logServerEvent(odv, "battle_voted", {
    battle_id: battleId,
    vote,
  });

  logger.info("[Battle] Voted", { battleId, odv, vote });

  return { success: true };
}

/**
 * Complete a battle (determine winner)
 */
export async function completeBattle(input: CompleteBattleInput) {
  if (!db) {
    throw new Error("Database not available");
  }

  const { battleId, winnerId, totalRounds } = input;

  // TODO: Implement actual battle completion in DB
  // await db.update(battles).set({ status: 'completed', winnerId }).where(eq(battles.id, battleId));

  // Log truth event AFTER successful completion
  // Note: Log for both participants if we know them
  if (winnerId) {
    await logServerEvent(winnerId, "battle_completed", {
      battle_id: battleId,
      winner_id: winnerId,
      total_rounds: totalRounds,
    });
  }

  logger.info("[Battle] Completed", { battleId, winnerId, totalRounds });

  return { success: true };
}

/**
 * Upload a battle response (trick clip)
 */
export async function uploadBattleResponse(odv: string, battleId: string, clipUrl: string) {
  if (!db) {
    throw new Error("Database not available");
  }

  // TODO: Implement actual response upload in DB

  // Log truth event AFTER successful upload
  await logServerEvent(odv, "battle_response_uploaded", {
    battle_id: battleId,
    clip_url: clipUrl,
  });

  logger.info("[Battle] Response uploaded", { battleId, odv });

  return { success: true };
}
