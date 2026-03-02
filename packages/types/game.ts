// =============================================================================
// S.K.A.T.E. Constants & Types (canonical source)
// =============================================================================

/** The five letters in S.K.A.T.E. as a readonly tuple */
export const SKATE_LETTERS = ["S", "K", "A", "T", "E"] as const;

/** Union type for a single SKATE letter */
export type SkateLetter = (typeof SKATE_LETTERS)[number];

/** Number of letters required to lose a S.K.A.T.E. game */
export const SKATE_LETTERS_TO_LOSE = 5;

/**
 * Determines if a game is over based on player letter counts.
 * Works with both string and array letter representations.
 */
export function isGameOver(
  player1Letters: string | readonly string[],
  player2Letters: string | readonly string[]
): { over: boolean; loserId: "player1" | "player2" | null } {
  if (player1Letters.length >= SKATE_LETTERS_TO_LOSE) return { over: true, loserId: "player1" };
  if (player2Letters.length >= SKATE_LETTERS_TO_LOSE) return { over: true, loserId: "player2" };
  return { over: false, loserId: null };
}

/** Judgment votes from both players during trick judging */
export interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
}

/** Status of a game session */
export type GameSessionStatus = "waiting" | "active" | "completed" | "abandoned" | "paused";

/** Current phase of a turn in the S.K.A.T.E. battle */
export type TurnPhase =
  | "attacker_recording" // Attacker is recording their trick
  | "defender_recording" // Defender is recording their attempt
  | "judging" // Both players vote on whether defender landed
  | "round_complete"; // Round finished, determining next attacker

/** A player in a game session (matches game_sessions.players JSON element) */
export interface GamePlayer {
  odv: string;
  letters: string;
  connected: boolean;
  disconnectedAt?: string;
}

/**
 * Result of a single move/attempt.
 * - "landed": trick was landed successfully
 * - "missed": trick was not landed (async/PostgreSQL system)
 * - "bailed": trick was not landed (real-time/Firestore mobile system)
 * - "pending": trick has not been judged yet
 *
 * "missed" and "bailed" mean the same thing — different game systems use
 * different terms. The async system uses "missed"; real-time uses "bailed".
 */
export type MoveResult = "landed" | "missed" | "bailed" | "pending";

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
