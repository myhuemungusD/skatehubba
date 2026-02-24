/**
 * S.K.A.T.E. Game Constants
 *
 * Shared constants for game logic across all game functions.
 */

export const SKATE_LETTERS = ["S", "K", "A", "T", "E"] as const;

/** Vote timeout duration in milliseconds (60 seconds) */
export const VOTE_TIMEOUT_MS = 60 * 1000;

/** Time before deadline to send reminder notification (30 seconds) */
export const VOTE_REMINDER_BEFORE_MS = 30 * 1000;
