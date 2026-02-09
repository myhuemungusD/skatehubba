/**
 * Shared constants, validation schemas, and helper functions for S.K.A.T.E. games
 */

import { z } from "zod";
import { getDb } from "../db";
import { customUsers, usernames } from "@shared/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// Constants
// ============================================================================

export const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_VIDEO_DURATION_MS = 15_000; // 15 seconds hard cap
export const SKATE_LETTERS = "SKATE";

// Dedup deadline warnings: track gameId → last warning timestamp
// Prevents spamming the same player every cron cycle
export const deadlineWarningsSent = new Map<string, number>();
export const DEADLINE_WARNING_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between warnings

// ============================================================================
// Validation Schemas
// ============================================================================

export const createGameSchema = z.object({
  opponentId: z.string().min(1, "Opponent ID is required"),
});

export const respondGameSchema = z.object({
  accept: z.boolean(),
});

export const submitTurnSchema = z.object({
  trickDescription: z.string().min(1).max(500),
  videoUrl: z.string().url().max(500),
  videoDurationMs: z.number().int().min(1).max(MAX_VIDEO_DURATION_MS),
  thumbnailUrl: z.string().url().max(500).optional(),
});

export const judgeTurnSchema = z.object({
  result: z.enum(["landed", "missed"]),
});

export const disputeSchema = z.object({
  turnId: z.number().int().positive(),
});

export const resolveDisputeSchema = z.object({
  disputeId: z.number().int().positive(),
  finalResult: z.enum(["landed", "missed"]),
});

// ============================================================================
// Helpers
// ============================================================================

export async function getUserDisplayName(db: ReturnType<typeof getDb>, odv: string): Promise<string> {
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

export function isGameOver(
  player1Letters: string,
  player2Letters: string
): { over: boolean; loserId: "player1" | "player2" | null } {
  if (player1Letters.length >= 5) return { over: true, loserId: "player1" };
  if (player2Letters.length >= 5) return { over: true, loserId: "player2" };
  return { over: false, loserId: null };
}
