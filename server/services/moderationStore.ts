import { admin } from "../admin";
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

const moderationCollection = () => admin.firestore().collection("moderation_users");
const reportsCollection = () => admin.firestore().collection("reports");
const modActionsCollection = () => admin.firestore().collection("mod_actions");
const quotaCollection = () => admin.firestore().collection("moderation_quotas");
const postsCollection = () => admin.firestore().collection("posts");

const defaultProfile: ModerationProfile = {
  trustLevel: 0,
  reputationScore: 0,
  isBanned: false,
  banExpiresAt: null,
  proVerificationStatus: "none",
  isProVerified: false,
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return value;
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate();
  }
  return null;
};

export const getModerationProfile = async (userId: string): Promise<ModerationProfile> => {
  const snapshot = await moderationCollection().doc(userId).get();
  if (!snapshot.exists) {
    return { ...defaultProfile };
  }

  const data = snapshot.data();
  return {
    trustLevel: (data?.trustLevel ?? 0) as TrustLevel,
    reputationScore: typeof data?.reputationScore === "number" ? data.reputationScore : 0,
    isBanned: Boolean(data?.isBanned ?? false),
    banExpiresAt: toDate(data?.banExpiresAt),
    proVerificationStatus: (data?.proVerificationStatus ?? "none") as ProVerificationStatus,
    isProVerified: Boolean(data?.isProVerified ?? false),
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
  const docRef = quotaCollection().doc(docId);

  const result = await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const count = snapshot.exists ? Number(snapshot.data()?.count ?? 0) : 0;

    if (count >= limit) {
      throw new QuotaExceededError();
    }

    const nextCount = count + 1;

    transaction.set(
      docRef,
      {
        userId,
        action,
        dateKey,
        count: nextCount,
        limit,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: snapshot.exists
          ? (snapshot.data()?.createdAt ?? admin.firestore.FieldValue.serverTimestamp())
          : admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { count: nextCount, limit };
  });

  return result;
};

export const createReport = async (input: ModerationReportInput) => {
  const reportRef = reportsCollection().doc();
  const payload = {
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    notes: input.notes,
    status: "queued",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await reportRef.set(payload);
  return { id: reportRef.id, ...payload };
};

export const listReports = async (status?: string) => {
  let query = reportsCollection().orderBy("createdAt", "desc").limit(100);
  if (status) {
    query = query.where("status", "==", status);
  }
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const logModAction = async (input: ModActionInput) => {
  const actionRef = modActionsCollection().doc();
  const payload = {
    adminId: input.adminId,
    targetUserId: input.targetUserId,
    actionType: input.actionType,
    reasonCode: input.reasonCode,
    notes: input.notes,
    reversible: input.reversible,
    expiresAt: input.expiresAt,
    relatedReportId: input.relatedReportId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await actionRef.set(payload);
  return { id: actionRef.id, ...payload };
};

export const applyModerationAction = async (input: ModActionInput) => {
  const profileRef = moderationCollection().doc(input.targetUserId);
  const updates: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

  await profileRef.set(updates, { merge: true });
  const log = await logModAction(input);
  return { ...log, updates };
};

export const setProVerificationStatus = async (input: ProVerificationInput) => {
  const profileRef = moderationCollection().doc(input.userId);

  await profileRef.set(
    {
      proVerificationStatus: input.status,
      isProVerified: input.status === "verified",
      proVerificationEvidence: input.evidence,
      proVerificationNotes: input.notes,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

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
  const postRef = postsCollection().doc();
  await postRef.set({
    ...payload,
    userId,
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: postRef.id, ...payload };
};
