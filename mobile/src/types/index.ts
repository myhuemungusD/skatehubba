// Shared types for SkateHubba Mobile

export interface User {
  id: string;
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string;
}

export interface Challenge {
  id: string;
  createdBy: string;
  opponent: string;
  participants: string[]; // Required for Firestore queries
  status: "pending" | "accepted" | "completed" | "forfeit";
  createdAt: Date;
  deadline: Date;
  rules: {
    oneTake: boolean;
    durationSec: number;
  };
  clipA: {
    url: string;
    thumbnailUrl?: string;
    durationSec: number;
  };
  clipB?: {
    url: string;
    thumbnailUrl?: string;
    durationSec: number;
  };
  winner: string | null;
}

export interface Spot {
  id: number;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  spotType: string | null;
  tier: "bronze" | "silver" | "gold" | "legendary" | null;
  photoUrl: string | null;
  thumbnailUrl: string | null;
  verified: boolean;
  isActive: boolean;
  checkInCount: number;
  rating: number | null;
  ratingCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckIn {
  id: number;
  userId: string;
  spotId: number;
  timestamp: string;
  expiresAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  photoURL: string | null;
  totalPoints: number;
  checkInCount: number;
  spotsUnlocked: number;
  tricksCompleted: number;
  currentStreak: number;
}

// Firebase Cloud Function types
export interface CreateChallengeRequest {
  opponentUid: string;
  clipUrl: string;
  clipDurationSec: number;
  thumbnailUrl?: string;
}

export interface CreateChallengeResponse {
  challengeId: string;
}

// =========================================================================
// S.K.A.T.E. BATTLE TYPES
// =========================================================================

/** The five letters in a S.K.A.T.E. game */
export type SkateLetter = "S" | "K" | "A" | "T" | "E";

/** All possible letters a player can accumulate */
export const SKATE_LETTERS: SkateLetter[] = ["S", "K", "A", "T", "E"];

/** Status of a game session */
export type GameSessionStatus = "waiting" | "active" | "completed" | "abandoned";

/** Current phase of a turn in the S.K.A.T.E. battle */
export type TurnPhase =
  | "attacker_recording" // Attacker is recording their trick
  | "defender_recording" // Defender is recording their attempt
  | "judging" // Both players vote on whether defender landed
  | "round_complete"; // Round finished, determining next attacker

/** Judgment votes from both players */
export interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
}

/** Result of a single move/attempt */
export type MoveResult = "landed" | "bailed" | "pending";

/** A single move/trick attempt in the game */
export interface Move {
  id: string;
  roundNumber: number;
  playerId: string;
  type: "set" | "match"; // 'set' = attacker sets trick, 'match' = defender attempts
  trickName: string | null; // Optional trick name (e.g., "Kickflip")
  clipUrl: string;
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

/** Local UI state for optimistic updates during trick recording */
export interface PendingUpload {
  id: string;
  localUri: string;
  progress: number;
  status: "uploading" | "processing" | "complete" | "failed";
  error: string | null;
}

/** UI overlay types for game state announcements */
export type GameOverlayType = "turn_start" | "waiting_opponent" | "letter_gained";

/** Configuration for game overlays */
export interface GameOverlay {
  type: GameOverlayType;
  title: string;
  subtitle: string | null;
  playerId: string | null; // Player this overlay relates to
  letter: SkateLetter | null; // Letter gained (if applicable)
  autoDismissMs: number | null; // Auto-dismiss timeout (null = manual)
}
