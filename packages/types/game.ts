/** The five letters in a S.K.A.T.E. game */
export type SkateLetter = "S" | "K" | "A" | "T" | "E";

/** All possible letters a player can accumulate */
export const SKATE_LETTERS: SkateLetter[] = ["S", "K", "A", "T", "E"];

/**
 * Status of a Firebase game session (mobile real-time games).
 *
 * Parallel enum: GAME_STATUSES in packages/shared/schema/games.ts covers
 * the PostgreSQL async game system with values:
 *   "pending" | "active" | "completed" | "declined" | "forfeited"
 */
export const GAME_SESSION_STATUSES = ["waiting", "active", "completed", "abandoned"] as const;
export type GameSessionStatus = (typeof GAME_SESSION_STATUSES)[number];

/**
 * Turn phase for Firebase real-time games (mobile).
 *
 * Parallel enum: TURN_PHASES in packages/shared/schema/games.ts covers
 * the PostgreSQL async game system with values:
 *   "set_trick" | "respond_trick" | "judge"
 *
 * Mapping: set_trick ↔ attacker_recording, respond_trick ↔ defender_recording,
 *          judge ↔ judging, (none) ↔ round_complete
 */
export const MOBILE_TURN_PHASES = [
  "attacker_recording", // Attacker is recording their trick
  "defender_recording", // Defender is recording their attempt
  "judging", // Both players vote on whether defender landed
  "round_complete", // Round finished, determining next attacker
] as const;
export type TurnPhase = (typeof MOBILE_TURN_PHASES)[number];

/** Judgment votes from both players */
export interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
}

/** A player in a game session (matches game_sessions.players JSON element) */
export interface GamePlayer {
  odv: string;
  letters: string;
  connected: boolean;
  disconnectedAt?: string;
}

/** Result of a single move/attempt */
export type MoveResult = "landed" | "bailed" | "missed" | "pending";

/** A single move/trick attempt in the game */
export interface Move {
  id: string;
  roundNumber: number;
  playerId: string;
  type: "set" | "match"; // 'set' = attacker sets trick, 'match' = defender attempts
  trickName: string | null; // Optional trick name (e.g., "Kickflip")
  clipUrl: string;
  /** Firebase Storage path for signed-URL resolution (null for legacy moves) */
  storagePath: string | null;
  thumbnailUrl: string | null;
  durationSec: number;
  result: MoveResult;
  /** Votes from both players (for match moves during judging) */
  judgmentVotes?: JudgmentVotes;
  createdAt: Date;
}

/** Main game session document structure */
export interface GameSession {
  id: string;
  player1Id: string;
  player2Id: string;
  player1DisplayName: string;
  player2DisplayName: string;
  player1PhotoURL: string | null;
  player2PhotoURL: string | null;
  player1Letters: SkateLetter[];
  player2Letters: SkateLetter[];
  currentTurn: string; // UID of player whose turn it is
  currentAttacker: string; // UID of current attacker
  turnPhase: TurnPhase;
  roundNumber: number;
  status: GameSessionStatus;
  winnerId: string | null;
  moves: Move[];
  currentSetMove: Move | null; // The trick the defender must match
  createdAt: Date;
  updatedAt: Date | null;
  completedAt: Date | null;
  /** Vote deadline timestamp (60 seconds after entering judging phase) */
  voteDeadline: Date | null;
  /** Whether the 30-second reminder has been sent */
  voteReminderSent: boolean | null;
  /** Flag indicating if the last vote was auto-resolved due to timeout */
  voteTimeoutOccurred: boolean | null;
}
