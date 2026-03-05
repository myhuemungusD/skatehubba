/**
 * Shared constants, validation schemas, and helper functions for S.K.A.T.E. games
 */

import { z } from "zod";
import { getUserDisplayName as getUserDisplayNameFromDb } from "../db";
import { SKATE_LETTERS_TO_LOSE } from "../config/constants";

// ============================================================================
// Game Constants (values match @skatehubba/utils)
// ============================================================================

export const SKATE_LETTERS = "SKATE";
export const SKATE_WORD = "SKATE";
export { SKATE_LETTERS_TO_LOSE };

export function isGameOver(
  player1Letters: string | readonly string[],
  player2Letters: string | readonly string[]
): { over: boolean; loserId: "player1" | "player2" | null } {
  if (player1Letters.length >= SKATE_LETTERS_TO_LOSE) return { over: true, loserId: "player1" };
  if (player2Letters.length >= SKATE_LETTERS_TO_LOSE) return { over: true, loserId: "player2" };
  return { over: false, loserId: null };
}

// ============================================================================
// Constants
// ============================================================================

export const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const GAME_HARD_CAP_MS = 7 * 24 * 60 * 60 * 1000; // 7 days total
export const MAX_VIDEO_DURATION_MS = 15_000; // 15 seconds hard cap

// Dedup deadline warnings: track gameId → last warning timestamp
// Prevents spamming the same player every cron cycle
// NOTE: In-memory — not shared across server instances. Duplicate warnings may
// occur under horizontal scaling, but this is acceptable for non-critical alerts.
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

/** Resolve dispute — disputeId comes from route param, only finalResult from body */
export const resolveDisputeSchema = z.object({
  finalResult: z.enum(["landed", "missed"]),
});

// ============================================================================
// Helpers
// ============================================================================

// Re-export centralized database helpers
export { getUserDisplayNameFromDb as getUserDisplayName };
