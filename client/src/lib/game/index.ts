/**
 * Game Module - S.K.A.T.E. Game Logic
 * 
 * Exports all game-related functionality including:
 * - GameService (FSM engine)
 * - Types and interfaces
 * - Helper utilities
 */

export { 
  GameService, 
  default 
} from './GameService';

export type {
  GameStatus,
  TurnPhase,
  CurrentTrick,
  PlayerData,
  GameState,
  GameDocument,
  QueueEntry,
  GameAction
} from './GameService';
