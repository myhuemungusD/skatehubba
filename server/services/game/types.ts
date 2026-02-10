/**
 * Game State Types
 *
 * Shared type definitions for the S.K.A.T.E. game state machine.
 */

import type { gameSessions } from "@shared/schema";

export interface GamePlayer {
  odv: string;
  letters: string; // "" -> "S" -> "SK" -> "SKA" -> "SKAT" -> "SKATE"
  connected: boolean;
  disconnectedAt?: string;
}

export interface GameState {
  id: string;
  spotId: string;
  creatorId: string;
  players: GamePlayer[];
  maxPlayers: number;
  currentTurnIndex: number;
  currentAction: "set" | "attempt";
  currentTrick?: string;
  setterId?: string; // Who set the current trick
  status: "waiting" | "active" | "paused" | "completed";
  winnerId?: string;
  createdAt: string;
  updatedAt: string;
  turnDeadlineAt?: string; // ISO timestamp for current turn deadline
  pausedAt?: string; // When game was paused due to disconnect
  processedEventIds: string[]; // Idempotency keys - last 100 events
}

export interface GameEvent {
  eventId: string; // Idempotency key
  type: "create" | "join" | "trick" | "pass" | "disconnect" | "reconnect" | "forfeit" | "timeout";
  odv: string;
  gameId: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export interface TransitionResult {
  success: boolean;
  game?: GameState;
  error?: string;
  alreadyProcessed?: boolean;
}

export type GameSessionRow = typeof gameSessions.$inferSelect;
export type GameSessionInsert = Partial<typeof gameSessions.$inferInsert>;
