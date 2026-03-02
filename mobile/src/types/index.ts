// Shared domain types — re-exported from @skatehubba/types
export type { Spot, CheckIn } from "@skatehubba/types";

import type { SkateLetter as _SkateLetter } from "@skatehubba/types";
export type { _SkateLetter as SkateLetter };

export type {
  GameSessionStatus,
  TurnPhase,
  GamePlayer,
  MoveResult,
  Move,
  GameSession,
} from "@skatehubba/types";

export { SKATE_LETTERS, GAME_SESSION_STATUSES, MOBILE_TURN_PHASES } from "@skatehubba/types";

export type { LeaderboardEntry } from "@skatehubba/types";

export type { Challenge, CreateChallengeRequest, CreateChallengeResponse } from "@skatehubba/types";

// Mobile-only: basic auth user (not the same as @skatehubba/types UserProfile)
export interface User {
  id: string;
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string;
}

// =========================================================================
// MOBILE-ONLY UI TYPES
// =========================================================================

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
  letter: _SkateLetter | null; // Letter gained (if applicable)
  autoDismissMs: number | null; // Auto-dismiss timeout (null = manual)
}
