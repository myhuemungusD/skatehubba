import crypto from "node:crypto";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { AuditLogger, AUDIT_EVENTS } from "../auth/audit";
import { env } from "../config/env";
import { getDb } from "../db";
import {
  checkIns,
  customUsers,
  filmerDailyCounters,
  filmerRequests,
  userProfiles,
} from "@shared/schema";

export type FilmerRequestStatus = "pending" | "accepted" | "rejected";
export type FilmerRequestAction = "accept" | "reject";

export type FilmerRequestSummary = {
  id: string;
  checkInId: string;
  requesterUid: string;
  filmerUid: string;
  status: FilmerRequestStatus;
  createdAt: string;
  updatedAt: string;
  reason?: string;
};

export class FilmerRequestError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const TRUST_LEVEL_REQUIRED = 1;
const REQUESTS_PER_DAY_LIMIT = 10;
const RESPONSES_PER_DAY_LIMIT = 50;
const COUNTER_RETENTION_DAYS = 7;

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

const ensureTrust = (trustLevel: number) => {
  if (trustLevel < TRUST_LEVEL_REQUIRED) {
    throw new FilmerRequestError("INSUFFICIENT_TRUST", "Insufficient trust level", 403);
  }
};

const ensureFilmerEligible = async (filmerUid: string) => {
  const db = getDb();
  const [filmer] = await db
    .select({
      isActive: customUsers.isActive,
    })
    .from(customUsers)
    .where(eq(customUsers.id, filmerUid))
    .limit(1);

  if (!filmer) {
    throw new FilmerRequestError("FILMER_NOT_FOUND", "Filmer not found", 404);
  }

  if (!filmer.isActive) {
    throw new FilmerRequestError("FILMER_INACTIVE", "Filmer is not active", 403);
  }

  const [profile] = await db
    .select({ roles: userProfiles.roles, filmerVerified: userProfiles.filmerVerified })
    .from(userProfiles)
    .where(eq(userProfiles.id, filmerUid))
    .limit(1);

  const isEligible = Boolean(profile?.filmerVerified) || Boolean(profile?.roles?.filmer);

  if (!isEligible) {
    throw new FilmerRequestError("FILMER_NOT_ELIGIBLE", "Filmer is not eligible for requests", 403);
  }
};

const cleanupExpiredCounters = async () => {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - COUNTER_RETENTION_DAYS);
  const cutoffDay = formatDateKey(cutoff);
  await db.delete(filmerDailyCounters).where(lt(filmerDailyCounters.day, cutoffDay));
};

type DatabaseClient = ReturnType<typeof getDb>;
type QuotaTransaction = Pick<DatabaseClient, "select" | "insert" | "update">;

const ensureQuota = async (
  tx: QuotaTransaction,
  counterKey: string,
  day: string,
  limit: number
) => {
  const [current] = await tx
    .select()
    .from(filmerDailyCounters)
    .where(and(eq(filmerDailyCounters.counterKey, counterKey), eq(filmerDailyCounters.day, day)))
    .limit(1);

  if (current && current.count >= limit) {
    throw new FilmerRequestError("QUOTA_EXCEEDED", "Daily quota exceeded", 429);
  }

  if (current) {
    await tx
      .update(filmerDailyCounters)
      .set({ count: current.count + 1, updatedAt: new Date() })
      .where(and(eq(filmerDailyCounters.counterKey, counterKey), eq(filmerDailyCounters.day, day)));
    return;
  }

  await tx.insert(filmerDailyCounters).values({
    counterKey,
    day,
    count: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};

export const createFilmerRequest = async (input: {
  requesterId: string;
  requesterTrustLevel: number;
  requesterIsActive: boolean;
  checkInId: number;
  filmerUid: string;
  ipAddress: string;
  userAgent?: string;
  deviceId?: string;
}) => {
  if (!input.requesterIsActive) {
    throw new FilmerRequestError("ACCOUNT_INACTIVE", "Account is inactive", 403);
  }

  if (input.requesterId === input.filmerUid) {
    throw new FilmerRequestError("SELF_FILMING_NOT_ALLOWED", "Filmer cannot be requester", 400);
  }

  ensureTrust(input.requesterTrustLevel);
  await ensureFilmerEligible(input.filmerUid);
  await cleanupExpiredCounters();

  const db = getDb();
  const requestId = crypto.randomUUID();
  const now = new Date();
  const day = formatDateKey(now);
  const counterKey = `filmer:request:${env.NODE_ENV}:${input.requesterId}`;
  let pendingRequestId: string | null = null;

  await db.transaction(async (tx) => {
    const [checkIn] = await tx
      .select()
      .from(checkIns)
      .where(eq(checkIns.id, input.checkInId))
      .limit(1);

    if (!checkIn) {
      throw new FilmerRequestError("CHECKIN_NOT_FOUND", "Check-in not found", 404);
    }

    if (checkIn.userId !== input.requesterId) {
      throw new FilmerRequestError("NOT_OWNER", "Cannot request filmer for another user", 403);
    }

    const [existing] = await tx
      .select({ id: filmerRequests.id, status: filmerRequests.status })
      .from(filmerRequests)
      .where(
        and(
          eq(filmerRequests.checkInId, input.checkInId),
          eq(filmerRequests.filmerId, input.filmerUid)
        )
      )
      .limit(1);

    if (existing) {
      if (existing.status === "pending") {
        pendingRequestId = existing.id;
        return;
      }
      throw new FilmerRequestError("REQUEST_RESOLVED", "Filmer request already resolved", 409);
    }

    if (checkIn.filmerUid || checkIn.filmerRequestId) {
      throw new FilmerRequestError("ALREADY_REQUESTED", "Filmer already requested", 409);
    }

    await ensureQuota(tx, counterKey, day, REQUESTS_PER_DAY_LIMIT);

    await tx.insert(filmerRequests).values({
      id: requestId,
      checkInId: input.checkInId,
      requesterId: input.requesterId,
      filmerId: input.filmerUid,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const [updated] = await tx
      .update(checkIns)
      .set({
        filmerUid: input.filmerUid,
        filmerStatus: "pending",
        filmerRequestedAt: now,
        filmerRequestId: requestId,
      })
      .where(and(eq(checkIns.id, input.checkInId), eq(checkIns.userId, input.requesterId)))
      .returning({ id: checkIns.id });

    if (!updated) {
      throw new FilmerRequestError("CHECKIN_UPDATE_FAILED", "Failed to update check-in", 500);
    }
  });

  if (pendingRequestId) {
    return {
      requestId: pendingRequestId,
      status: "pending" as FilmerRequestStatus,
      alreadyExists: true,
    };
  }

  await AuditLogger.log({
    eventType: AUDIT_EVENTS.FILMER_REQUEST_CREATED,
    userId: input.requesterId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    success: true,
    metadata: {
      requestId,
      checkInId: input.checkInId,
      filmerUid: input.filmerUid,
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    },
  });

  return { requestId, status: "pending" as FilmerRequestStatus, alreadyExists: false };
};

export const respondToFilmerRequest = async (input: {
  requestId: string;
  filmerId: string;
  action: FilmerRequestAction;
  reason?: string;
  ipAddress: string;
  userAgent?: string;
  deviceId?: string;
}) => {
  if (input.action === "reject" && !input.reason) {
    throw new FilmerRequestError("REASON_REQUIRED", "Reject reason is required", 400);
  }

  await ensureFilmerEligible(input.filmerId);
  await cleanupExpiredCounters();

  const db = getDb();
  const now = new Date();
  const day = formatDateKey(now);
  const counterKey = `filmer:respond:${env.NODE_ENV}:${input.filmerId}`;

  const nextStatus: FilmerRequestStatus = input.action === "accept" ? "accepted" : "rejected";
  let requestContext: { checkInId: number; requesterId: string } | null = null;

  await db.transaction(async (tx) => {
    await ensureQuota(tx, counterKey, day, RESPONSES_PER_DAY_LIMIT);

    const [request] = await tx
      .select()
      .from(filmerRequests)
      .where(eq(filmerRequests.id, input.requestId))
      .limit(1);

    if (!request) {
      throw new FilmerRequestError("NOT_FOUND", "Filmer request not found", 404);
    }

    if (request.filmerId !== input.filmerId) {
      throw new FilmerRequestError("FORBIDDEN", "Only the filmer can respond", 403);
    }

    if (request.status !== "pending") {
      throw new FilmerRequestError("INVALID_STATUS", "Request already resolved", 409);
    }

    const [updatedRequest] = await tx
      .update(filmerRequests)
      .set({
        status: nextStatus,
        reason: input.reason ?? null,
        updatedAt: now,
        respondedAt: now,
      })
      .where(and(eq(filmerRequests.id, input.requestId), eq(filmerRequests.status, "pending")))
      .returning({ id: filmerRequests.id });

    if (!updatedRequest) {
      throw new FilmerRequestError("INVALID_STATUS", "Request already resolved", 409);
    }

    const [updatedCheckIn] = await tx
      .update(checkIns)
      .set({
        filmerStatus: nextStatus,
        filmerRespondedAt: now,
      })
      .where(
        and(
          eq(checkIns.id, request.checkInId),
          eq(checkIns.filmerRequestId, input.requestId),
          eq(checkIns.filmerStatus, "pending")
        )
      )
      .returning({ id: checkIns.id });

    if (!updatedCheckIn) {
      throw new FilmerRequestError("CHECKIN_UPDATE_FAILED", "Failed to update check-in", 500);
    }

    requestContext = { checkInId: request.checkInId, requesterId: request.requesterId };
  });

  await AuditLogger.log({
    eventType:
      nextStatus === "accepted"
        ? AUDIT_EVENTS.FILMER_REQUEST_ACCEPTED
        : AUDIT_EVENTS.FILMER_REQUEST_REJECTED,
    userId: input.filmerId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    success: true,
    metadata: {
      requestId: input.requestId,
      status: nextStatus,
      ...(requestContext
        ? { checkInId: requestContext.checkInId, requesterUid: requestContext.requesterId }
        : {}),
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });

  return { requestId: input.requestId, status: nextStatus };
};

export const listFilmerRequests = async (input: {
  userId: string;
  status?: FilmerRequestStatus;
  role?: "filmer" | "requester" | "all";
  limit?: number;
}) => {
  const db = getDb();
  const limit = input.limit ?? 50;
  const role = input.role ?? "filmer";

  const roleFilter =
    role === "all"
      ? or(eq(filmerRequests.filmerId, input.userId), eq(filmerRequests.requesterId, input.userId))
      : role === "requester"
        ? eq(filmerRequests.requesterId, input.userId)
        : eq(filmerRequests.filmerId, input.userId);

  const statusFilter = input.status
    ? and(roleFilter, eq(filmerRequests.status, input.status))
    : roleFilter;

  const requests = await db
    .select()
    .from(filmerRequests)
    .where(statusFilter)
    .orderBy(desc(filmerRequests.updatedAt))
    .limit(limit);

  return requests.map((request) => ({
    id: request.id,
    checkInId: request.checkInId.toString(),
    requesterUid: request.requesterId,
    filmerUid: request.filmerId,
    status: request.status as FilmerRequestStatus,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    ...(request.reason ? { reason: request.reason } : {}),
  }));
};
