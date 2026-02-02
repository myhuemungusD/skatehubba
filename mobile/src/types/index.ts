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
  status: 'pending' | 'accepted' | 'completed' | 'forfeit';
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
  description: string;
  latitude: number;
  longitude: number;
  address: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'legendary';
  tags: string[];
  imageUrl?: string;
  checkInCount: number;
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
export type SkateLetter = 'S' | 'K' | 'A' | 'T' | 'E';

/** All possible letters a player can accumulate */
export const SKATE_LETTERS: SkateLetter[] = ['S', 'K', 'A', 'T', 'E'];

/** Status of a game session */
export type GameSessionStatus = 'waiting' | 'active' | 'completed' | 'abandoned';

/** Current phase of a turn in the S.K.A.T.E. battle */
export type TurnPhase =
  | 'attacker_recording'  // Attacker is recording their trick
  | 'attacker_uploaded'   // Attacker's clip uploaded, waiting for defender
  | 'defender_recording'  // Defender is recording their attempt
  | 'defender_uploaded'   // Defender's clip uploaded, awaiting judgment
  | 'judging'             // Determining if defender landed the trick
  | 'round_complete';     // Round finished, determining next attacker

/** Result of a single move/attempt */
export type MoveResult = 'landed' | 'bailed' | 'pending';

/** Vote type for judging a trick attempt */
export type TrickVote = 'clean' | 'sketch' | 'redo';

/** Status of a player in the current game */
export interface PlayerStatus {
  id: string;
  displayName: string;
  photoURL: string | null;
  letters: SkateLetter[];        // Letters accumulated (e.g., ['S', 'K'])
  isAttacker: boolean;           // Whether this player is currently attacking
  isConnected: boolean;          // Real-time connection status
  lastSeen: Date | null;
}

/** A single move/trick attempt in the game */
export interface Move {
  id: string;
  roundNumber: number;
  playerId: string;
  type: 'set' | 'match';         // 'set' = attacker sets trick, 'match' = defender attempts
  trickName: string | null;      // Optional trick name (e.g., "Kickflip")
  clipUrl: string;
  thumbnailUrl: string | null;
  durationSec: number;
  result: MoveResult;
  votes: {
    clean: number;
    sketch: number;
    redo: number;
  };
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
  currentTurn: string;           // UID of player whose turn it is
  currentAttacker: string;       // UID of current attacker
  turnPhase: TurnPhase;
  roundNumber: number;
  status: GameSessionStatus;
  winnerId: string | null;
  moves: Move[];
  currentSetMove: Move | null;   // The trick the defender must match
  createdAt: Date;
  updatedAt: Date | null;
  completedAt: Date | null;
}

/** Props for the main S.K.A.T.E. battle screen */
export interface SkateBattleProps {
  gameId: string;
  currentUserId: string;
}

/** Local UI state for optimistic updates during trick recording */
export interface PendingUpload {
  id: string;
  localUri: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'failed';
  error: string | null;
}

/** UI overlay types for game state announcements */
export type GameOverlayType =
  | 'turn_start'
  | 'recording'
  | 'uploading'
  | 'waiting_opponent'
  | 'judging'
  | 'letter_gained'
  | 'round_complete'
  | 'game_over';

/** Configuration for game overlays */
export interface GameOverlay {
  type: GameOverlayType;
  title: string;
  subtitle: string | null;
  playerId: string | null;      // Player this overlay relates to
  letter: SkateLetter | null;   // Letter gained (if applicable)
  autoDismissMs: number | null; // Auto-dismiss timeout (null = manual)
}
