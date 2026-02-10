/**
 * Filmer Request Service
 *
 * Manages the workflow for users requesting professional filmers to capture their tricks.
 * Implements quota limits, trust requirements, and state management for the filmer request lifecycle.
 *
 * Features:
 * - Request creation with quota enforcement (10 requests per day per requester)
 * - Response handling with quota limits (50 responses per day per filmer)
 * - Trust level verification to prevent abuse
 * - TOCTOU-safe quota checks using SELECT FOR UPDATE row locking
 * - Audit trail for all operations
 *
 * @module services/filmerRequests
 */

import crypto from "node:crypto";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
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

/** Status of a filmer request */
export type FilmerRequestStatus = "pending" | "accepted" | "rejected";

/** Action types for responding to filmer requests */
export type FilmerRequestAction = "accept" | "reject";

/** Serialized summary of a filmer request for API responses */
export type FilmerRequestSummary = {
  /** Unique request identifier */
  id: string;
  /** Associated check-in ID */
  checkInId: string;
  /** User ID who requested the filmer */
  requesterUid: string;
  /** User ID of the filmer */
  filmerUid: string;
  /** Current status of the request */
  status: FilmerRequestStatus;
  /** ISO 8601 timestamp when request was created */
  createdAt: string;
  /** ISO 8601 timestamp when request was last updated */
  updatedAt: string;
  /** Optional rejection reason provided by filmer */
  reason?: string;
};

/** Internal context for request operations */
type RequestContext = { checkInId: number; requesterId: string };

/**
 * Custom error class for filmer request operations
 * Includes HTTP status code and machine-readable error code
 */
export class FilmerRequestError extends Error {
  /** HTTP status code for the error */
  status: number;
  /** Machine-readable error code */
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
  // Use SELECT FOR UPDATE to prevent TOCTOU race conditions on quota check.
  // The row lock ensures two concurrent requests cannot both read the same count
  // and both pass the quota check.
  const [current] = await tx
    .select()
    .from(filmerDailyCounters)
    .where(and(eq(filmerDailyCounters.counterKey, counterKey), eq(filmerDailyCounters.day, day)))
    .for("update")
    .limit(1);

  if (current && current.count >= limit) {
    throw new FilmerRequestError("QUOTA_EXCEEDED", "Daily quota exceeded", 429);
  }

  if (current) {
    // Atomic increment using SQL expression
    await tx
      .update(filmerDailyCounters)
      .set({ count: sql`${filmerDailyCounters.count} + 1`, updatedAt: new Date() })
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

/**
 * Create a filmer request for a check-in
 *
 * Validates requester eligibility, enforces daily quota limits, and creates a pending
 * filmer request. If a pending request already exists for the same check-in and filmer,
 * returns the existing request (idempotent).
 *
 * Validations:
 * - Requester account must be active
 * - Requester and filmer must be different users
 * - Requester must have sufficient trust level (≥1)
 * - Filmer must be eligible (active, verified, or has filmer role)
 * - Check-in must exist and belong to requester
 * - No resolved request exists for this check-in + filmer pair
 * - Requester has not exceeded daily request quota (10/day)
 *
 * @param input - Request parameters
 * @returns Request ID, status, and whether request already existed
 * @throws {FilmerRequestError} If validation fails or quota exceeded
 *
 * @example
 * ```typescript
 * const result = await createFilmerRequest({
 *   requesterId: 'user_123',
 *   requesterTrustLevel: 2,
 *   requesterIsActive: true,
 *   checkInId: 456,
 *   filmerUid: 'filmer_789',
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...',
 *   deviceId: 'device_abc'
 * });
 * // => { requestId: 'req_xyz', status: 'pending', alreadyExists: false }
 * ```
 */
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

/**
 * Respond to a filmer request (accept or reject)
 *
 * Allows filmers to accept or reject pending requests. Updates both the filmer request
 * and associated check-in records atomically within a transaction.
 *
 * Validations:
 * - Request must exist and be in pending status
 * - Only the designated filmer can respond
 * - Filmer must be eligible (verified or has filmer role)
 * - Reject action requires a reason
 * - Filmer has not exceeded daily response quota (50/day)
 *
 * @param input - Response parameters
 * @returns Request ID and new status
 * @throws {FilmerRequestError} If validation fails, request not found, or quota exceeded
 *
 * @example
 * ```typescript
 * // Accept a request
 * const result = await respondToFilmerRequest({
 *   requestId: 'req_xyz',
 *   filmerId: 'filmer_789',
 *   action: 'accept',
 *   ipAddress: '192.168.1.1'
 * });
 * // => { requestId: 'req_xyz', status: 'accepted' }
 * ```
 *
 * @example
 * ```typescript
 * // Reject a request with reason
 * const result = await respondToFilmerRequest({
 *   requestId: 'req_xyz',
 *   filmerId: 'filmer_789',
 *   action: 'reject',
 *   reason: 'Not available at this location',
 *   ipAddress: '192.168.1.1'
 * });
 * // => { requestId: 'req_xyz', status: 'rejected' }
 * ```
 */
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
  let requestContext: RequestContext | null = null;

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
      checkInId: requestContext!.checkInId,
      requesterUid: requestContext!.requesterId,
      ...(input.deviceId && { deviceId: input.deviceId }),
      ...(input.reason && { reason: input.reason }),
    },
  });

  return { requestId: input.requestId, status: nextStatus };
};

/**
 * List filmer requests for a user
 *
 * Returns requests where the user is either the filmer or requester, with optional
 * filtering by status and role. Results are ordered by most recently updated first.
 *
 * @param input - Query parameters
 * @param input.userId - User ID to query requests for
 * @param input.status - Optional status filter ('pending', 'accepted', 'rejected')
 * @param input.role - Optional role filter ('filmer', 'requester', 'all'). Default: 'filmer'
 * @param input.limit - Maximum number of requests to return. Default: 50
 * @returns Array of filmer request summaries
 *
 * @example
 * ```typescript
 * // Get all pending requests where user is the filmer
 * const requests = await listFilmerRequests({
 *   userId: 'filmer_789',
 *   status: 'pending',
 *   role: 'filmer'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Get all requests (any status, any role) for a user
 * const allRequests = await listFilmerRequests({
 *   userId: 'user_123',
 *   role: 'all',
 *   limit: 100
 * });
 * ```
 */
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
