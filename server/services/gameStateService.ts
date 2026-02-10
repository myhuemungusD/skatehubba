/**
 * Game State Service
 *
 * Manages real-time S.K.A.T.E. game state using PostgreSQL with transactional updates.
 * Uses SELECT FOR UPDATE for distributed locking to prevent race conditions.
 *
 * Features:
 * - Atomic state transitions via PostgreSQL transactions with row-level locking
 * - Idempotency keys to prevent duplicate event processing
 * - Turn timeouts (60s, defender wins on timeout)
 * - Disconnect handling with reconnection window
 * - Auto-forfeit after disconnection timeout
 *
 * This file re-exports all game state operations from their individual modules.
 */

// Types
export type { GamePlayer, GameState, GameEvent, TransitionResult } from "./game/types";

// Helpers
export { generateEventId } from "./game/helpers";

// Operations
export { createGame, joinGame } from "./game/createJoin";
export { submitTrick, passTrick } from "./game/tricks";
export { handleDisconnect, handleReconnect } from "./game/connection";
export { forfeitGame } from "./game/forfeit";
export { getGameState, deleteGame } from "./game/queries";
export { processTimeouts } from "./game/timeouts";
