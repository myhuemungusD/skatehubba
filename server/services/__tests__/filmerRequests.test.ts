/**
 * Behavior tests for Filmer Requests Service
 *
 * Tests the filmer request lifecycle: responding to requests with race
 * condition safety, and listing requests by role, status, and limit.
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

describe("Filmer Requests Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Helper: build a mock select chain for eligibility checks */
  function createSelectChainForEligibility() {
    let selectCallCount = 0;

    return () => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([{ isActive: true }]);
            }
            if (selectCallCount === 2) {
              return Promise.resolve([{ filmerVerified: true, roles: null }]);
            }
            return Promise.resolve([]);
          }),
          for: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => Promise.resolve([])),
          }),
        }),
      }),
    });
  }

  describe("respondToFilmerRequest", () => {
    it("rejects concurrent accept attempts on the same filmer request", async () => {
      // When two accepts race, the UPDATE WHERE status='pending' returns
      // no rows for the slower one — the service should throw INVALID_STATUS.
      const createSelectChain = createSelectChainForEligibility();

      const txDb = {
        select: vi.fn().mockImplementation(createSelectChain),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue({}),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };

      let txSelectCount = 0;
      txDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              txSelectCount++;
              if (txSelectCount === 1) {
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
              limit: vi.fn().mockImplementation(() => Promise.resolve([])),
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
        expect.fail("Expected FilmerRequestError to be thrown");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FilmerRequestError);
        expect(e.code).toBe("INVALID_STATUS");
        expect(e.status).toBe(409);
      }
    });
  });

  describe("listFilmerRequests", () => {
    /** Helper: wire up a mock DB returning the given rows */
    function mockDbWithRows(rows: any[]) {
      const limitFn = vi.fn().mockResolvedValue(rows);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      mockGetDb.mockReturnValue({ select: selectFn });
      return { selectFn, limitFn };
    }

    it("defaults to filmer role and returns serialized request summaries", async () => {
      const now = new Date();
      mockDbWithRows([
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
      ]);

      const results = await listFilmerRequests({ userId: "filmer-1" });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: "req-1",
        checkInId: "100",
        filmerUid: "filmer-1",
        requesterUid: "requester-1",
        status: "pending",
        createdAt: now.toISOString(),
      });
    });

    it("filters by requester role when specified", async () => {
      const now = new Date();
      mockDbWithRows([
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

      const results = await listFilmerRequests({
        userId: "user-1",
        role: "requester",
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("accepted");
    });

    it("returns all requests when role is 'all'", async () => {
      const now = new Date();
      mockDbWithRows([
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

      const results = await listFilmerRequests({
        userId: "user-1",
        role: "all",
      });

      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe("Too busy");
    });

    it("applies status filter to narrow results", async () => {
      const { selectFn } = mockDbWithRows([]);

      const results = await listFilmerRequests({
        userId: "filmer-1",
        status: "pending",
        role: "filmer",
      });

      expect(results).toEqual([]);
      expect(selectFn).toHaveBeenCalled();
    });

    it("respects custom page size limit", async () => {
      const { limitFn } = mockDbWithRows([]);

      await listFilmerRequests({
        userId: "filmer-1",
        limit: 10,
      });

      expect(limitFn).toHaveBeenCalledWith(10);
    });

    it("omits reason field from response when null", async () => {
      const now = new Date();
      mockDbWithRows([
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

      const results = await listFilmerRequests({ userId: "film-user" });

      expect(results[0]).not.toHaveProperty("reason");
    });

    it("includes reason field in response when present", async () => {
      const now = new Date();
      mockDbWithRows([
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

      const results = await listFilmerRequests({ userId: "film-user" });

      expect(results[0].reason).toBe("Not available");
    });
  });
});
