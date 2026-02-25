/** The five letters in a S.K.A.T.E. game */
export type SkateLetter = "S" | "K" | "A" | "T" | "E";

/** All possible letters a player can accumulate */
export const SKATE_LETTERS: SkateLetter[] = ["S", "K", "A", "T", "E"];

/** Status of a game session (matches game_sessions.status) */
export type GameSessionStatus = "waiting" | "active" | "paused" | "completed";

/** Current action phase in a turn (matches game_sessions.current_action) */
export type TurnPhase = "set" | "attempt";

/** A player in a game session (matches game_sessions.players JSON element) */
export interface GamePlayer {
  odv: string;
  letters: string;
  connected: boolean;
  disconnectedAt?: string;
}

/** Result of a single turn/attempt (matches game_turns.result) */
export type MoveResult = "landed" | "missed" | "pending";

/** A single turn in the game (matches game_turns table) */
export interface Move {
  id: number;
  gameId: string;
  playerId: string;
  playerName: string;
  turnNumber: number;
  turnType: "set" | "response";
  trickDescription: string;
  videoUrl: string | null;
  videoDurationMs: number | null;
  thumbnailUrl: string | null;
  result: MoveResult;
  judgedBy: string | null;
  judgedAt: Date | null;
  createdAt: Date;
}

/** Main game session structure (matches game_sessions table) */
export interface GameSession {
  id: string;
  spotId: string;
  creatorId: string;
  players: GamePlayer[];
  maxPlayers: number;
  currentTurnIndex: number;
  currentAction: TurnPhase;
  currentTrick: string | null;
  setterId: string | null;
  status: GameSessionStatus;
  winnerId: string | null;
  turnDeadlineAt: Date | null;
  pausedAt: Date | null;
  processedEventIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
