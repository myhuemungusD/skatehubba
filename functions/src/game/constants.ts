/**
 * S.K.A.T.E. Game Constants
 *
 * Shared constants for game logic across all game functions.
 * Values match @skatehubba/utils and @skatehubba/types.
 */

export const SKATE_LETTERS = ["S", "K", "A", "T", "E"] as const;

export const SKATE_LETTERS_TO_LOSE = 5;

export interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
}

/** Vote timeout duration in milliseconds (60 seconds) */
export const VOTE_TIMEOUT_MS = 60 * 1000;

/** Time before deadline to send reminder notification (30 seconds) */
export const VOTE_REMINDER_BEFORE_MS = 30 * 1000;
