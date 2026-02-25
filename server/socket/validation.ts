/**
 * Socket Event Validation
 *
 * Zod schemas for validating incoming socket events.
 * Prevents malformed data from reaching handlers.
 */

import { z } from "zod";

// H5: Strict ID patterns to prevent log injection and special character abuse
const safeId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, "Invalid ID format");
const safeUuid = z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/, "Invalid UUID format");

// ============================================================================
// Battle Event Schemas
// ============================================================================

export const battleCreateSchema = z.object({
  creatorId: safeId,
  matchmaking: z.enum(["open", "direct"]),
  opponentId: safeId.optional(),
});

export const battleVoteSchema = z.object({
  battleId: safeUuid,
  odv: safeId,
  vote: z.enum(["clean", "sketch", "redo"]),
});

// ============================================================================
// Game Event Schemas
// ============================================================================

export const gameCreateSchema = z.object({
  spotId: safeId,
  maxPlayers: z.number().int().min(2).max(8).optional(),
});

export const gameTrickSchema = z.object({
  gameId: safeUuid,
  odv: safeId,
  trickName: z.string().min(1).max(200),
  clipUrl: z.string().url().refine((url) => /^https?:\/\//.test(url), "URL must use HTTP(S)").optional(),
});

// ============================================================================
// Room Event Schemas
// ============================================================================

export const roomJoinSchema = z.object({
  roomType: z.enum(["battle", "game", "spot", "global"]),
  roomId: safeUuid,
});

// ============================================================================
// Presence Event Schemas
// ============================================================================

export const presenceUpdateSchema = z.object({
  status: z.enum(["online", "away"]),
});

// ============================================================================
// Validation Helper
// ============================================================================

/**
 * Validate event data and return typed result
 */
export function validateEvent<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
  };
}

/**
 * Sanitize string input (prevent XSS in stored data)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
}
