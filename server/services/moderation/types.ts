/**
 * Moderation Store — Type Definitions
 */

import type { ProVerificationStatus } from "../trustSafety";

/** Types of moderation actions that can be applied to users */
export type ModActionType =
  | "warn"
  | "remove_content"
  | "temp_ban"
  | "perm_ban"
  | "verify_pro"
  | "revoke_pro";

/** Input parameters for creating a moderation report */
export interface ModerationReportInput {
  /** User ID submitting the report */
  reporterId: string;
  /** Type of content being reported */
  targetType: "user" | "post" | "checkin" | "comment";
  /** ID of the reported content */
  targetId: string;
  /** Short reason for the report (3-100 characters) */
  reason: string;
  /** Additional context or details (max 500 characters) */
  notes: string | null;
}

/** Input parameters for applying a moderation action */
export interface ModActionInput {
  /** Admin user ID performing the action */
  adminId: string;
  /** User ID being moderated */
  targetUserId: string;
  /** Type of action to apply */
  actionType: ModActionType;
  /** Machine-readable reason code (2-50 characters) */
  reasonCode: string;
  /** Human-readable explanation (max 500 characters) */
  notes: string | null;
  /** Whether the action can be reversed */
  reversible: boolean;
  /** Expiration date for temporary actions */
  expiresAt: Date | null;
  /** Optional report ID that triggered this action */
  relatedReportId: string | null;
}

/** Input parameters for setting pro verification status */
export interface ProVerificationInput {
  /** Admin user ID performing the verification */
  adminId: string;
  /** User ID being verified */
  userId: string;
  /** New verification status */
  status: ProVerificationStatus;
  /** Array of evidence URLs or descriptions */
  evidence: string[];
  /** Admin notes about verification decision */
  notes: string | null;
}

/**
 * Error thrown when a user exceeds their daily quota for a moderation action
 */
export class QuotaExceededError extends Error {
  constructor(message = "QUOTA_EXCEEDED") {
    super(message);
    this.name = "QuotaExceededError";
  }
}
