/**
 * Moderation Store Service
 *
 * Manages moderation profiles, reports, actions, and quotas for the trust & safety system.
 * Provides persistence layer for all moderation-related data with race-condition-safe quota enforcement.
 *
 * Features:
 * - User moderation profiles (trust level, bans, pro verification)
 * - Report creation and management
 * - Moderation action logging
 * - Quota enforcement with SELECT FOR UPDATE locking
 * - Pro verification workflow
 *
 * @module services/moderation
 * @see {@link module:services/trustSafety} for trust & safety middleware and rules
 */

export type {
  ModActionType,
  ModerationReportInput,
  ModActionInput,
  ProVerificationInput,
} from "./types";
export { QuotaExceededError } from "./types";
export { getModerationProfile } from "./profiles";
export { consumeQuota } from "./quota";
export { createReport, listReports } from "./reports";
export { logModAction, applyModerationAction } from "./actions";
export { setProVerificationStatus } from "./proVerification";
export { createPost } from "./posts";
