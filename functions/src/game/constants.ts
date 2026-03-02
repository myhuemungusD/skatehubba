/**
 * S.K.A.T.E. Game Constants
 *
 * Shared constants for game logic across all game functions.
 */

// Re-export from single source of truth
export { SKATE_LETTERS, SKATE_LETTERS_TO_LOSE, isGameOver } from "@skatehubba/utils";
export type { JudgmentVotes } from "@skatehubba/utils";

/** Vote timeout duration in milliseconds (60 seconds) */
export const VOTE_TIMEOUT_MS = 60 * 1000;

/** Time before deadline to send reminder notification (30 seconds) */
export const VOTE_REMINDER_BEFORE_MS = 30 * 1000;
