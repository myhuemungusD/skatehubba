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
 * @module services/moderationStore
 * @see {@link module:services/trustSafety} for trust & safety middleware and rules
 */

import { eq, desc, and, count } from "drizzle-orm";
import { getDb } from "../db";
import {
  moderationProfiles,
  moderationReports,
  modActions,
  moderationQuotas,
  posts,
} from "@shared/schema";
import {
  type ModerationAction,
  type ModerationProfile,
  type ProVerificationStatus,
  type TrustLevel,
  TRUST_QUOTAS,
} from "./trustSafety";

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

const defaultProfile: ModerationProfile = {
  trustLevel: 0,
  reputationScore: 0,
  isBanned: false,
  banExpiresAt: null,
  proVerificationStatus: "none",
  isProVerified: false,
};

/**
 * Get a user's moderation profile
 *
 * Returns the moderation profile for a user, including trust level, reputation score,
 * ban status, and pro verification status. If no profile exists, returns default values.
 *
 * @param userId - User ID to fetch profile for
 * @returns Moderation profile with trust and safety information
 *
 * @example
 * ```typescript
 * const profile = await getModerationProfile('user_123');
 * if (profile.isBanned) {
 *   return res.status(403).json({ error: 'Account is banned' });
 * }
 * ```
 */
export const getModerationProfile = async (userId: string): Promise<ModerationProfile> => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(moderationProfiles)
    .where(eq(moderationProfiles.userId, userId))
    .limit(1);

  if (!row) {
    return { ...defaultProfile };
  }

  return {
    trustLevel: (row.trustLevel ?? 0) as TrustLevel,
    reputationScore: typeof row.reputationScore === "number" ? row.reputationScore : 0,
    isBanned: Boolean(row.isBanned ?? false),
    banExpiresAt: row.banExpiresAt ?? null,
    proVerificationStatus: (row.proVerificationStatus ?? "none") as ProVerificationStatus,
    isProVerified: Boolean(row.isProVerified ?? false),
  };
};

const getDateKey = (date = new Date()): string => date.toISOString().slice(0, 10);

/**
 * Consume one quota unit for a moderation action
 *
 * Atomically increments the user's daily quota counter for the specified action.
 * Uses SELECT FOR UPDATE row locking to prevent race conditions where concurrent
 * requests could both read the same count and exceed the quota.
 *
 * Quota limits are determined by the user's trust level (see TRUST_QUOTAS).
 * Quotas reset daily at midnight UTC.
 *
 * @param userId - User ID consuming the quota
 * @param action - Moderation action being performed ('report', 'vote', 'post', etc.)
 * @param trustLevel - User's current trust level (0-3)
 * @returns Current count and limit for this action
 * @throws {QuotaExceededError} If user has exceeded their daily quota
 *
 * @example
 * ```typescript
 * try {
 *   const { count, limit } = await consumeQuota('user_123', 'report', 1);
 *   console.log(`Used ${count} of ${limit} reports today`);
 * } catch (error) {
 *   if (error instanceof QuotaExceededError) {
 *     return res.status(429).json({ error: 'Daily report limit exceeded' });
 *   }
 * }
 * ```
 */
export const consumeQuota = async (
  userId: string,
  action: ModerationAction,
  trustLevel: TrustLevel
): Promise<{ count: number; limit: number }> => {
  const limit = TRUST_QUOTAS[trustLevel][action];
  const dateKey = getDateKey();
  const docId = `${userId}_${action}_${dateKey}`;
  const db = getDb();

  // Use a transaction with SELECT FOR UPDATE to prevent race conditions
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(moderationQuotas)
      .where(eq(moderationQuotas.id, docId))
      .for("update");

    const count = existing ? existing.count : 0;

    if (count >= limit) {
      throw new QuotaExceededError();
    }

    const nextCount = count + 1;
    const now = new Date();

    if (existing) {
      await tx
        .update(moderationQuotas)
        .set({ count: nextCount, updatedAt: now })
        .where(eq(moderationQuotas.id, docId));
    } else {
      await tx.insert(moderationQuotas).values({
        id: docId,
        userId,
        action,
        dateKey,
        count: nextCount,
        limit,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { count: nextCount, limit };
  });

  return result;
};

/**
 * Create a new moderation report
 *
 * Records a user-submitted report about problematic content or behavior.
 * Reports are queued for admin review and can be used to trigger automated
 * or manual moderation actions.
 *
 * @param input - Report details
 * @returns Created report record
 *
 * @example
 * ```typescript
 * const report = await createReport({
 *   reporterId: 'user_123',
 *   targetType: 'post',
 *   targetId: 'post_456',
 *   reason: 'spam',
 *   notes: 'Repeated promotional content'
 * });
 * console.log(`Report created: ${report.id}`);
 * ```
 */
export const createReport = async (input: ModerationReportInput) => {
  const db = getDb();
  const [report] = await db
    .insert(moderationReports)
    .values({
      reporterId: input.reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      notes: input.notes,
    })
    .returning();

  return report;
};

/**
 * List moderation reports with pagination
 *
 * Returns reports optionally filtered by status, ordered by creation date (newest first).
 * Includes total count for pagination UI.
 *
 * @param status - Optional status filter (e.g., 'pending', 'resolved', 'dismissed')
 * @param page - Page number (1-indexed). Default: 1
 * @param limit - Reports per page. Default: 20
 * @returns Reports and total count
 *
 * @example
 * ```typescript
 * const { reports, total } = await listReports('pending', 1, 50);
 * console.log(`Showing ${reports.length} of ${total} pending reports`);
 * ```
 */
export const listReports = async (status?: string, page = 1, limit = 20) => {
  const db = getDb();
  const offset = (page - 1) * limit;

  const conditions = status ? [eq(moderationReports.status, status)] : [];
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [reports, [totalRow]] = await Promise.all([
    db
      .select()
      .from(moderationReports)
      .where(whereClause)
      .orderBy(desc(moderationReports.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(moderationReports).where(whereClause),
  ]);

  return { reports, total: totalRow?.value ?? 0 };
};

/**
 * Log a moderation action to the audit trail
 *
 * Creates a permanent record of a moderation action for compliance and auditing.
 * All moderation actions should be logged through this function.
 *
 * @param input - Action details
 * @returns Logged action record
 *
 * @example
 * ```typescript
 * const action = await logModAction({
 *   adminId: 'admin_123',
 *   targetUserId: 'user_456',
 *   actionType: 'temp_ban',
 *   reasonCode: 'spam_violation',
 *   notes: '3 spam reports in 24 hours',
 *   reversible: true,
 *   expiresAt: new Date('2025-01-22T00:00:00Z'),
 *   relatedReportId: 'report_789'
 * });
 * ```
 */
export const logModAction = async (input: ModActionInput) => {
  const db = getDb();
  const [action] = await db
    .insert(modActions)
    .values({
      adminId: input.adminId,
      targetUserId: input.targetUserId,
      actionType: input.actionType,
      reasonCode: input.reasonCode,
      notes: input.notes,
      reversible: input.reversible,
      expiresAt: input.expiresAt,
      relatedReportId: input.relatedReportId,
    })
    .returning();

  return action;
};

/**
 * Apply a moderation action to a user
 *
 * Updates the user's moderation profile based on the action type and logs the action
 * to the audit trail. Supports warnings, content removal, temporary/permanent bans,
 * and pro verification changes.
 *
 * Action Effects:
 * - `temp_ban`: Sets isBanned=true with expiration date
 * - `perm_ban`: Sets isBanned=true with no expiration
 * - `verify_pro`: Sets proVerificationStatus='verified' and isProVerified=true
 * - `revoke_pro`: Sets proVerificationStatus='rejected' and isProVerified=false
 * - Other actions: Logged but don't directly modify profile
 *
 * @param input - Action details
 * @returns Logged action record with applied updates
 *
 * @example
 * ```typescript
 * const result = await applyModerationAction({
 *   adminId: 'admin_123',
 *   targetUserId: 'user_456',
 *   actionType: 'temp_ban',
 *   reasonCode: 'harassment',
 *   notes: 'Multiple harassment reports',
 *   reversible: true,
 *   expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
 *   relatedReportId: 'report_789'
 * });
 * ```
 */
export const applyModerationAction = async (input: ModActionInput) => {
  const db = getDb();
  const now = new Date();

  const updates: Record<string, unknown> = {
    updatedAt: now,
  };

  if (input.actionType === "temp_ban") {
    updates.isBanned = true;
    updates.banExpiresAt = input.expiresAt;
  }

  if (input.actionType === "perm_ban") {
    updates.isBanned = true;
    updates.banExpiresAt = null;
  }

  if (input.actionType === "verify_pro") {
    updates.proVerificationStatus = "verified";
    updates.isProVerified = true;
  }

  if (input.actionType === "revoke_pro") {
    updates.proVerificationStatus = "rejected";
    updates.isProVerified = false;
  }

  // Upsert the moderation profile
  await db
    .insert(moderationProfiles)
    .values({
      userId: input.targetUserId,
      ...updates,
      createdAt: now,
    } as typeof moderationProfiles.$inferInsert)
    .onConflictDoUpdate({
      target: moderationProfiles.userId,
      set: updates as Partial<typeof moderationProfiles.$inferInsert>,
    });

  const log = await logModAction(input);
  return { ...log, updates };
};

/**
 * Set pro verification status for a user
 *
 * Updates a user's professional skater verification status with evidence and notes.
 * Automatically logs the corresponding moderation action (verify_pro or revoke_pro).
 *
 * Pro verification gives users:
 * - Special badge on profile
 * - Higher trust level
 * - Access to pro-only features
 * - Increased credibility
 *
 * @param input - Verification details including status, evidence, and notes
 * @returns Logged moderation action
 *
 * @example
 * ```typescript
 * const action = await setProVerificationStatus({
 *   adminId: 'admin_123',
 *   userId: 'user_456',
 *   status: 'verified',
 *   evidence: [
 *     'https://instagram.com/pro_skater',
 *     'Sponsor: Element Skateboards',
 *     'Competition results: X Games 2024'
 *   ],
 *   notes: 'Verified through sponsor confirmation'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Revoke pro status
 * const action = await setProVerificationStatus({
 *   adminId: 'admin_123',
 *   userId: 'user_456',
 *   status: 'rejected',
 *   evidence: [],
 *   notes: 'Unable to verify professional status'
 * });
 * ```
 */
export const setProVerificationStatus = async (input: ProVerificationInput) => {
  const db = getDb();
  const now = new Date();

  await db
    .insert(moderationProfiles)
    .values({
      userId: input.userId,
      proVerificationStatus: input.status,
      isProVerified: input.status === "verified",
      proVerificationEvidence: input.evidence,
      proVerificationNotes: input.notes,
      updatedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: moderationProfiles.userId,
      set: {
        proVerificationStatus: input.status,
        isProVerified: input.status === "verified",
        proVerificationEvidence: input.evidence,
        proVerificationNotes: input.notes,
        updatedAt: now,
      },
    });

  return logModAction({
    adminId: input.adminId,
    targetUserId: input.userId,
    actionType: input.status === "verified" ? "verify_pro" : "revoke_pro",
    reasonCode: "pro_verification",
    notes: input.notes,
    reversible: true,
    expiresAt: null,
    relatedReportId: null,
  });
};

/**
 * Create a post (used for testing moderation)
 *
 * Creates a new post record with active status. This function is primarily used
 * for testing moderation workflows and may be moved or expanded in the future.
 *
 * @param userId - User ID creating the post
 * @param payload - Post content (flexible JSON structure)
 * @returns Created post record
 *
 * @example
 * ```typescript
 * const post = await createPost('user_123', {
 *   text: 'Check out this sick kickflip!',
 *   videoUrl: 'https://...',
 *   spotId: 42
 * });
 * ```
 */
export const createPost = async (userId: string, payload: Record<string, unknown>) => {
  const db = getDb();
  const [post] = await db
    .insert(posts)
    .values({
      userId,
      status: "active",
      content: payload,
    })
    .returning();

  return post;
};
