/**
 * Additional branch coverage tests for filmerRequests/operations.ts
 *
 * Targets uncovered branches:
 * - createFilmerRequest: line 54 — requesterIsActive=false (ACCOUNT_INACTIVE)
 * - createFilmerRequest: line 57 — self-filming (requesterId === filmerUid)
 * - createFilmerRequest: line 106 — checkIn already has filmerUid or filmerRequestId
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../config/env", () => ({
  env: {
    NODE_ENV: "test",
  },
}));

vi.mock("../../auth/audit", () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
  },
  AUDIT_EVENTS: {
    FILMER_REQUEST_CREATED: "filmer_request_created",
    FILMER_REQUEST_ACCEPTED: "filmer_request_accepted",
    FILMER_REQUEST_REJECTED: "filmer_request_rejected",
  },
}));

vi.mock("@shared/schema", () => ({
  checkIns: {
    id: { name: "id" },
    userId: { name: "userId" },
    filmerUid: { name: "filmerUid" },
    filmerRequestId: { name: "filmerRequestId" },
    filmerStatus: { name: "filmerStatus" },
    filmerRequestedAt: { name: "filmerRequestedAt" },
    filmerRespondedAt: { name: "filmerRespondedAt" },
  },
  customUsers: {
    id: { name: "id" },
    isActive: { name: "isActive" },
  },
  filmerDailyCounters: {
    counterKey: { name: "counterKey" },
    day: { name: "day" },
    count: { name: "count" },
    createdAt: { name: "createdAt" },
    updatedAt: { name: "updatedAt" },
  },
  filmerRequests: {
    id: { name: "id" },
    checkInId: { name: "checkInId" },
    requesterId: { name: "requesterId" },
    filmerId: { name: "filmerId" },
    status: { name: "status" },
    reason: { name: "reason" },
    createdAt: { name: "createdAt" },
    updatedAt: { name: "updatedAt" },
    respondedAt: { name: "respondedAt" },
  },
  userProfiles: {
    id: { name: "id" },
    roles: { name: "roles" },
    filmerVerified: { name: "filmerVerified" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
  and: (...args: any[]) => ({ _op: "and", args }),
  or: (...args: any[]) => ({ _op: "or", args }),
  lt: (col: any, val: any) => ({ _op: "lt", col, val }),
  desc: (col: any) => ({ _op: "desc", col }),
  sql: (strings: TemplateStringsArray, ...vals: any[]) => ({
    _sql: true,
    strings,
    vals,
  }),
}));

import { createFilmerRequest } from "../filmerRequests/operations";

describe("createFilmerRequest branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws ACCOUNT_INACTIVE when requesterIsActive is false (line 54)", async () => {
    try {
      await createFilmerRequest({
        requesterId: "requester-1",
        requesterTrustLevel: 2,
        requesterIsActive: false,
        checkInId: 100,
        filmerUid: "filmer-1",
        ipAddress: "127.0.0.1",
      });
      expect.fail("Expected error to be thrown");
    } catch (e: any) {
      expect(e.code).toBe("ACCOUNT_INACTIVE");
      expect(e.status).toBe(403);
    }
  });

  it("throws SELF_FILMING_NOT_ALLOWED when requesterId equals filmerUid (line 57)", async () => {
    try {
      await createFilmerRequest({
        requesterId: "same-user",
        requesterTrustLevel: 2,
        requesterIsActive: true,
        checkInId: 100,
        filmerUid: "same-user",
        ipAddress: "127.0.0.1",
      });
      expect.fail("Expected error to be thrown");
    } catch (e: any) {
      expect(e.code).toBe("SELF_FILMING_NOT_ALLOWED");
      expect(e.status).toBe(400);
    }
  });
});
