/**
 * Shared constants and validation schemas for S.K.A.T.E. game routes
 */

import { z } from "zod";

export const SKATE_LETTERS = "SKATE";
export const SKATE_LETTERS_TO_LOSE = 5;
export const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000;
export const MAX_VIDEO_DURATION_MS = 15_000;

export const createGameSchema = z.object({
  /** Array of opponent IDs — 1 to 4 opponents (2-5 total players) */
  opponentIds: z
    .array(z.string().min(1))
    .min(1, "At least one opponent is required")
    .max(4, "Maximum 4 opponents (5 players total)"),
});

export const joinGameSchema = z.object({
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
