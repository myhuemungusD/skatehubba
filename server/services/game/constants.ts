/**
 * Game State Constants
 */

export const SKATE = "SKATE";
export const TURN_TIMEOUT_MS = 60 * 1000; // 60 seconds for voting/turns
export const RECONNECT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes to reconnect
export const MAX_PROCESSED_EVENTS = 100; // Keep last 100 event IDs for idempotency
