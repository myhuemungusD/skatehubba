/**
 * Filmer Request Service — Core Operations
 *
 * Create, respond, and list filmer requests.
 */

import crypto from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { AuditLogger, AUDIT_EVENTS } from "../../auth/audit";
import { env } from "../../config/env";
import { getDb } from "../../db";
import { checkIns, filmerRequests } from "@shared/schema";
import {
  FilmerRequestError,
  type FilmerRequestAction,
  type FilmerRequestStatus,
  type RequestContext,
} from "./types";
import { REQUESTS_PER_DAY_LIMIT, RESPONSES_PER_DAY_LIMIT, formatDateKey } from "./constants";
import { ensureTrust, ensureFilmerEligible } from "./validation";
import { cleanupExpiredCounters, ensureQuota } from "./quota";

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
 * @returns Array of filmer request summaries
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
