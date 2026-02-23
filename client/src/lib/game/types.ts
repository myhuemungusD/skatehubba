/**
 * GameService — Type Definitions
 */

import type { Timestamp } from "firebase/firestore";

/** Game lifecycle status */
export type GameStatus =
  | "MATCHMAKING" // In queue, searching for opponent
  | "PENDING_ACCEPT" // Private challenge sent, awaiting response
  | "ACTIVE" // Game in progress
  | "COMPLETED" // Game finished (winner determined)
  | "CANCELLED"; // Abandoned or declined

/** Turn phase within active game */
export type TurnPhase =
  | "SETTER_RECORDING" // Current turn player is setting a trick
  | "DEFENDER_ATTEMPTING" // Opponent is attempting to match
  | "VERIFICATION"; // Optional: dispute resolution

/** The current trick being played */
export interface CurrentTrick {
  name: string;
  description?: string;
  setterId: string;
  setAt: Timestamp;
}

/** Player data stored in game document */
export interface PlayerData {
  username: string;
  photoUrl?: string | null;
  stance: "regular" | "goofy";
}

/** Internal game state machine */
export interface GameState {
  status: GameStatus;
  turnPlayerId: string; // Who is currently "It"
  phase: TurnPhase;
  p1Letters: number; // 0-5 (S-K-A-T-E)
  p2Letters: number;
  currentTrick: CurrentTrick | null;
  roundNumber: number;
}

/** Complete game document */
export interface GameDocument {
  id: string;
  players: [string, string]; // [player1Id, player2Id]
  playerData: {
    [playerId: string]: PlayerData;
  };
  state: GameState;
  winnerId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Matchmaking queue entry */
export interface QueueEntry {
  createdBy: string;
  creatorName: string;
  creatorPhoto?: string | null;
  stance: "regular" | "goofy";
  status: "WAITING" | "MATCHED";
  createdAt: Timestamp;
}

/** Actions that can be taken in the game */
export type GameAction = "SET" | "LAND" | "BAIL" | "FORFEIT";
