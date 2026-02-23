/**
 * GameService - Enterprise-Grade S.K.A.T.E. Game Engine
 *
 * A strictly typed Finite State Machine (FSM) for managing real-time
 * S.K.A.T.E. games using Firebase Firestore with:
 * - Optimistic Concurrency Control (transactions)
 * - Turn strictness enforcement
 * - Real-time state synchronization
 * - Cost-efficient database reads
 *
 * @module lib/game/GameService
 */

// Re-export all types for callers that import from this file
export type {
  GameStatus,
  TurnPhase,
  CurrentTrick,
  PlayerData,
  GameState,
  GameDocument,
  QueueEntry,
  GameAction,
} from "./types";

import { findQuickMatch, cancelMatchmaking, subscribeToQueue } from "./matchmaking";
import { submitAction, setterMissed } from "./gameActions";
import { subscribeToGame, getActiveGames } from "./subscriptions";
import { getLettersString, isGameOver, getOpponentData } from "./utils";

// =============================================================================
// GAME SERVICE (Singleton Pattern)
// =============================================================================

export const GameService = {
  // A. MATCHMAKING
  findQuickMatch,
  cancelMatchmaking,
  subscribeToQueue,

  // B. GAME LOOP
  submitAction,
  setterMissed,

  // C. REAL-TIME SUBSCRIPTIONS
  subscribeToGame,
  getActiveGames,

  // D. HELPER FUNCTIONS
  getLettersString,
  isGameOver,
  getOpponentData,
};

export default GameService;
