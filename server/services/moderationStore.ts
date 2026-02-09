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

export type ModActionType =
  | "warn"
  | "remove_content"
  | "temp_ban"
  | "perm_ban"
  | "verify_pro"
  | "revoke_pro";

export interface ModerationReportInput {
  reporterId: string;
  targetType: "user" | "post" | "checkin" | "comment";
  targetId: string;
  reason: string;
  notes: string | null;
}

export interface ModActionInput {
  adminId: string;
  targetUserId: string;
  actionType: ModActionType;
  reasonCode: string;
  notes: string | null;
  reversible: boolean;
  expiresAt: Date | null;
  relatedReportId: string | null;
}

export interface ProVerificationInput {
  adminId: string;
  userId: string;
  status: ProVerificationStatus;
  evidence: string[];
  notes: string | null;
}

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
