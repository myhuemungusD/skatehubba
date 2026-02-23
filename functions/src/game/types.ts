/**
 * S.K.A.T.E. Game Type Definitions
 */

export interface SubmitTrickRequest {
  gameId: string;
  clipUrl: string;
  /** Firebase Storage path for signed-URL resolution (preferred over clipUrl) */
  storagePath?: string;
  trickName: string | null;
  isSetTrick: boolean;
  /** Client-generated idempotency key to prevent duplicate submissions */
  idempotencyKey: string;
}

export interface SubmitTrickResponse {
  success: boolean;
  moveId: string;
  /** True if this was a duplicate submission (already processed) */
  duplicate: boolean;
}

export interface JudgeTrickRequest {
  gameId: string;
  moveId: string;
  vote: "landed" | "bailed";
  /** Client-generated idempotency key */
  idempotencyKey: string;
}

export interface JudgeTrickResponse {
  success: boolean;
  vote: "landed" | "bailed";
  finalResult: "landed" | "bailed" | null;
  waitingForOtherVote: boolean;
  winnerId: string | null;
  gameCompleted: boolean;
  /** True if this was a duplicate vote (already processed) */
  duplicate: boolean;
}

export interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
}
