import { db } from "../db";
import { logServerEvent } from "./analyticsService";
import logger from "../logger";
import { battles, battleVotes } from "../../shared/schema";
import { eq } from "drizzle-orm";

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

  const [battle] = await db
    .insert(battles)
    .values({
      creatorId: input.creatorId,
      matchmaking: input.matchmaking,
      opponentId: input.opponentId,
      status: "waiting",
    })
    .returning();

  // Log truth event AFTER successful creation
  await logServerEvent(input.creatorId, "battle_created", {
    battle_id: battle.id,
    matchmaking: input.matchmaking,
    opponent_id: input.opponentId,
    stance: input.stance,
    skill: input.skill,
  });

  logger.info("[Battle] Created", {
    battleId: battle.id,
    creatorId: input.creatorId,
  });

  return { battleId: battle.id };
}

/**
 * Join an existing battle
 */
export async function joinBattle(odv: string, battleId: string) {
  if (!db) {
    throw new Error("Database not available");
  }

  const [battle] = await db
    .update(battles)
    .set({
      opponentId: odv,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(battles.id, battleId))
    .returning();

  if (!battle) {
    throw new Error("Battle not found");
  }

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

  // Insert vote (upsert to handle re-votes)
  await db
    .insert(battleVotes)
    .values({
      battleId,
      odv,
      vote,
    })
    .onConflictDoUpdate({
      target: [battleVotes.battleId, battleVotes.odv],
      set: { vote },
    });

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

  await db
    .update(battles)
    .set({
      status: "completed",
      winnerId,
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(eq(battles.id, battleId));

  // Log truth event AFTER successful completion
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

  // Get battle to check if this is creator or opponent
  const [battle] = await db.select().from(battles).where(eq(battles.id, battleId));

  if (!battle) {
    throw new Error("Battle not found");
  }

  // Set the appropriate clip URL field
  const isCreator = battle.creatorId === odv;
  await db
    .update(battles)
    .set({
      ...(isCreator ? { clipUrl } : { responseClipUrl: clipUrl }),
      updatedAt: new Date(),
    })
    .where(eq(battles.id, battleId));

  // Log truth event AFTER successful upload
  await logServerEvent(odv, "battle_response_uploaded", {
    battle_id: battleId,
    clip_url: clipUrl,
  });

  logger.info("[Battle] Response uploaded", { battleId, odv });

  return { success: true };
}

/**
 * Get a battle by ID
 */
export async function getBattle(battleId: string) {
  if (!db) {
    throw new Error("Database not available");
  }

  const [battle] = await db.select().from(battles).where(eq(battles.id, battleId));
  return battle || null;
}

/**
 * Get votes for a battle
 */
export async function getBattleVotes(battleId: string) {
  if (!db) {
    throw new Error("Database not available");
  }

  return db.select().from(battleVotes).where(eq(battleVotes.battleId, battleId));
}

/**
 * Set battle status to voting phase
 */
export async function setBattleVoting(battleId: string) {
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(battles)
    .set({
      status: "voting",
      updatedAt: new Date(),
    })
    .where(eq(battles.id, battleId));

  return { success: true };
}
