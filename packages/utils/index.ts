/**
 * @skatehubba/utils — Shared constants, types, and helpers for S.K.A.T.E. games
 *
 * Single source of truth for game logic shared across server, client,
 * mobile, and Cloud Functions layers.
 */

// =============================================================================
// S.K.A.T.E. Letter Constants
// =============================================================================

/** The five letters in S.K.A.T.E. as a readonly tuple */
export const SKATE_LETTERS = ["S", "K", "A", "T", "E"] as const;

/** Union type for a single SKATE letter */
export type SkateLetter = (typeof SKATE_LETTERS)[number];

/** The string form of all SKATE letters concatenated */
export const SKATE_WORD = "SKATE" as const;

/** Number of letters required to lose a S.K.A.T.E. game */
export const SKATE_LETTERS_TO_LOSE = 5;

// =============================================================================
// Game Logic Helpers
// =============================================================================

/**
 * Determines if a game is over based on player letter counts.
 *
 * Works with both string and array letter representations:
 * - string: "SKA" → length 3
 * - array: ["S","K","A"] → length 3
 *
 * @returns `{ over, loserId }` where loserId is "player1" or "player2" if game is over
 */
export function isGameOver(
  player1Letters: string | readonly string[],
  player2Letters: string | readonly string[]
): { over: boolean; loserId: "player1" | "player2" | null } {
  const p1Len = player1Letters.length;
  const p2Len = player2Letters.length;

  if (p1Len >= SKATE_LETTERS_TO_LOSE) return { over: true, loserId: "player1" };
  if (p2Len >= SKATE_LETTERS_TO_LOSE) return { over: true, loserId: "player2" };
  return { over: false, loserId: null };
}

// =============================================================================
// Judgment Votes (shared across server, mobile, functions)
// =============================================================================

/** Judgment votes from both players during trick judging */
export interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
}
