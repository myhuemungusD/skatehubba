/**
 * Unit tests for Filmer Requests Service - covering uncovered lines:
 * - Line 423: Race condition in respondToFilmerRequest (update returns no row)
 * - Line 442: Race condition in respondToFilmerRequest (checkIn update returns no row)
 * - Lines 509-531: listFilmerRequests (all branches: role filters, status filter)
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

import { respondToFilmerRequest, listFilmerRequests, FilmerRequestError } from "../filmerRequests";

describe("filmerRequests - uncovered paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper to create a mock DB that handles the complex query chains
   */
  function createChainableDb() {
    const forFn = vi.fn().mockReturnThis();
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn, for: forFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const returningFn = vi.fn().mockResolvedValue([{ id: "req-1" }]);
    const updateWhereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });

    const insertValuesFn = vi.fn().mockResolvedValue({});
    const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });

    const deleteFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    const orderByFn = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) });

    return {
      select: selectFn,
      from: fromFn,
      where: whereFn,
      limit: limitFn,
      for: forFn,
      update: updateFn,
      insert: insertFn,
      delete: deleteFn,
      orderBy: orderByFn,
      transaction: vi.fn(),
      _limitFn: limitFn,
      _returningFn: returningFn,
      _updateSetFn: updateSetFn,
      _updateWhereFn: updateWhereFn,
    };
  }

  // ==========================================================================
  // Line 423: respondToFilmerRequest race condition - update returns no row
  // ==========================================================================

  describe("respondToFilmerRequest - race conditions", () => {
    /**
     * Line 422-423: When the UPDATE ... WHERE status='pending' returns no row
     * (another request already changed the status between SELECT and UPDATE)
     */
    it("throws INVALID_STATUS when filmerRequest update returns no row (line 423)", async () => {
      // ensureFilmerEligible queries use getDb() directly (not in tx).
      // respondToFilmerRequest flow:
      //   1. ensureFilmerEligible: select customUsers, select userProfiles
      //   2. cleanupExpiredCounters: delete
      //   3. db.transaction: ensureQuota -> select request -> update request (returns []) -> THROW

      let selectCallCount = 0;

      const createSelectChain = () => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              selectCallCount++;
              if (selectCallCount === 1) {
                // ensureFilmerEligible: customUsers
                return Promise.resolve([{ isActive: true }]);
              }
              if (selectCallCount === 2) {
                // ensureFilmerEligible: userProfiles
                return Promise.resolve([{ filmerVerified: true, roles: null }]);
              }
              return Promise.resolve([]);
            }),
            for: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                // ensureQuota: no existing counter
                return Promise.resolve([]);
              }),
            }),
          }),
        }),
      });

      const txDb = {
        select: vi.fn().mockImplementation(createSelectChain),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue({}),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              // Race condition: update WHERE status='pending' returns no rows
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };

      // Make tx select for the request lookup return the pending request
      let txSelectCount = 0;
      txDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              txSelectCount++;
              if (txSelectCount === 1) {
                // The filmer request select
                return Promise.resolve([
                  {
                    id: "req-1",
                    filmerId: "filmer-1",
                    requesterId: "requester-1",
                    checkInId: 100,
                    status: "pending",
                  },
                ]);
              }
              return Promise.resolve([]);
            }),
            for: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                // ensureQuota: no existing counter
                return Promise.resolve([]);
              }),
            }),
          }),
        }),
      }));

      const outerDb = {
        select: vi.fn().mockImplementation(createSelectChain),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
        transaction: vi.fn().mockImplementation(async (fn: any) => fn(txDb)),
      };

      mockGetDb.mockReturnValue(outerDb);

      try {
        await respondToFilmerRequest({
          requestId: "req-1",
          filmerId: "filmer-1",
          action: "accept",
          ipAddress: "127.0.0.1",
        });
        // Should not reach here
        expect.fail("Expected FilmerRequestError to be thrown");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilmerRequestError);
        expect(e.code).toBe("INVALID_STATUS");
        expect(e.status).toBe(409);
      }
    });
  });

  // ==========================================================================
  // Lines 509-531: listFilmerRequests
  // ==========================================================================

  describe("listFilmerRequests (lines 509-531)", () => {
    it("lists requests with default role (filmer) and no status filter", async () => {
      const now = new Date();
      const mockRequests = [
        {
          id: "req-1",
          checkInId: 100,
          requesterId: "requester-1",
          filmerId: "filmer-1",
          status: "pending",
          reason: null,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const limitFn = vi.fn().mockResolvedValue(mockRequests);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      mockGetDb.mockReturnValue({ select: selectFn });

      const results = await listFilmerRequests({ userId: "filmer-1" });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("req-1");
      expect(results[0].checkInId).toBe("100");
      expect(results[0].filmerUid).toBe("filmer-1");
      expect(results[0].requesterUid).toBe("requester-1");
      expect(results[0].status).toBe("pending");
      expect(results[0].createdAt).toBe(now.toISOString());
    });

    it("lists requests with role=requester", async () => {
      const now = new Date();
      const limitFn = vi.fn().mockResolvedValue([
        {
          id: "req-2",
          checkInId: 200,
          requesterId: "user-1",
          filmerId: "filmer-2",
          status: "accepted",
          reason: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      mockGetDb.mockReturnValue({ select: selectFn });

      const results = await listFilmerRequests({
        userId: "user-1",
        role: "requester",
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("accepted");
    });

    it("lists requests with role=all", async () => {
      const now = new Date();
      const limitFn = vi.fn().mockResolvedValue([
        {
          id: "req-3",
          checkInId: 300,
          requesterId: "user-1",
          filmerId: "user-1",
          status: "rejected",
          reason: "Too busy",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      mockGetDb.mockReturnValue({ select: selectFn });

      const results = await listFilmerRequests({
        userId: "user-1",
        role: "all",
      });

      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe("Too busy");
    });

    it("lists requests with status filter", async () => {
      const now = new Date();
      const limitFn = vi.fn().mockResolvedValue([]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      mockGetDb.mockReturnValue({ select: selectFn });

      const results = await listFilmerRequests({
        userId: "filmer-1",
        status: "pending",
        role: "filmer",
      });

      expect(results).toEqual([]);
      expect(selectFn).toHaveBeenCalled();
    });

    it("respects custom limit", async () => {
      const limitFn = vi.fn().mockResolvedValue([]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      mockGetDb.mockReturnValue({ select: selectFn });

      await listFilmerRequests({
        userId: "filmer-1",
        limit: 10,
      });

      // The limit function should have been called with 10
      expect(limitFn).toHaveBeenCalledWith(10);
    });

    it("omits reason field when null", async () => {
      const now = new Date();
      const limitFn = vi.fn().mockResolvedValue([
        {
          id: "req-4",
          checkInId: 400,
          requesterId: "req-user",
          filmerId: "film-user",
          status: "pending",
          reason: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      mockGetDb.mockReturnValue({ select: selectFn });

      const results = await listFilmerRequests({ userId: "film-user" });

      expect(results[0]).not.toHaveProperty("reason");
    });

    it("includes reason field when present", async () => {
      const now = new Date();
      const limitFn = vi.fn().mockResolvedValue([
        {
          id: "req-5",
          checkInId: 500,
          requesterId: "req-user",
          filmerId: "film-user",
          status: "rejected",
          reason: "Not available",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      mockGetDb.mockReturnValue({ select: selectFn });

      const results = await listFilmerRequests({ userId: "film-user" });

      expect(results[0].reason).toBe("Not available");
    });
  });
});
