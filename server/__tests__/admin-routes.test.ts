/**
 * @fileoverview Integration tests for admin routes
 *
 * Tests:
 * - GET /stats: dashboard stats, db unavailable, db error
 * - GET /users: user list with pagination/search, empty, db unavailable, error
 * - PATCH /users/:userId/trust-level: update, invalid input, user not found, db unavailable, error
 * - PATCH /reports/:reportId/status: update, invalid status, report not found, db unavailable, error
 * - GET /audit-logs: paginated logs with filters, db unavailable, error
 * - GET /mod-actions: paginated actions, db unavailable, error
 * - PATCH /users/:userId/tier: override tier, invalid tier, user not found, db unavailable, error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks
// =============================================================================

// Mock Express Router to capture registered routes
const capturedRoutes: any[] = [];
vi.mock("express", () => ({
  Router: () => {
    const mockRouter: any = {};
    for (const method of ["get", "post", "put", "patch", "delete", "use"]) {
      mockRouter[method] = vi.fn((...args: any[]) => {
        capturedRoutes.push({ method, args });
        return mockRouter;
      });
    }
    return mockRouter;
  },
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../middleware/auditLog", () => ({
  auditMiddleware: vi.fn(() => vi.fn((_req: any, _res: any, next: any) => next())),
  emitAuditLog: vi.fn(),
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((_req: any, _res: any, next: any) => next()),
  requireAdmin: vi.fn((_req: any, _res: any, next: any) => next()),
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../middleware/trustSafety", () => ({
  enforceAdminRateLimit: () => vi.fn((_req: any, _res: any, next: any) => next()),
  enforceNotBanned: () => vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
  ilike: vi.fn(),
  or: vi.fn(),
  inArray: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  customUsers: {
    id: "id",
    email: "email",
    firstName: "firstName",
    lastName: "lastName",
    accountTier: "accountTier",
    trustLevel: "trustLevel",
    isActive: "isActive",
    isEmailVerified: "isEmailVerified",
    lastLoginAt: "lastLoginAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    proAwardedBy: "proAwardedBy",
    premiumPurchasedAt: "premiumPurchasedAt",
  },
  moderationProfiles: {
    userId: "userId",
    isBanned: "isBanned",
    banExpiresAt: "banExpiresAt",
    reputationScore: "reputationScore",
    proVerificationStatus: "proVerificationStatus",
    isProVerified: "isProVerified",
    trustLevel: "trustLevel",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  moderationReports: {
    id: "id",
    status: "status",
  },
  modActions: {
    id: "id",
    createdAt: "createdAt",
  },
  auditLogs: {
    id: "id",
    eventType: "eventType",
    userId: "userId",
    success: "success",
    createdAt: "createdAt",
  },
  orders: {},
}));

let mockIsDatabaseAvailable = true;
let mockDbInstance: any;

function createMockDbChain() {
  const chain: any = {};
  const methods = [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "update",
    "set",
    "returning",
    "insert",
    "values",
    "onConflictDoUpdate",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // By default resolve to empty array (override per test via mockResolvedValue on terminal methods)
  chain.offset.mockResolvedValue([]);
  chain.returning.mockResolvedValue([]);
  chain.onConflictDoUpdate.mockResolvedValue([]);
  chain.limit.mockReturnValue(chain);
  // Also make 'from' resolve as a promise for count queries that end at .from().where()
  // We handle this by making where also resolvable
  return chain;
}

vi.mock("../db", () => ({
  getDb: () => mockDbInstance,
  isDatabaseAvailable: () => mockIsDatabaseAvailable,
}));

// Import real Errors and sendError so status codes flow through res.status().json()
// (no mock needed — they call res.status(N).json({...}) which our mock res supports)

// =============================================================================
// Imports after mocks
// =============================================================================

await import("../routes/admin");

// =============================================================================
// Helpers
// =============================================================================

function createReq(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    currentUser: { id: "admin-1", role: "admin" },
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * Walk through the middleware chain for a captured route.
 * Finds the route by method + path substring match, then invokes each
 * handler/middleware in sequence, passing a next() that continues the chain.
 */
async function callHandler(method: string, path: string, req: any, res: any) {
  const route = capturedRoutes.find((r) => r.method === method.toLowerCase() && r.args[0] === path);
  if (!route) {
    const available = capturedRoutes
      .map((r) => `${r.method.toUpperCase()} ${r.args[0]}`)
      .join(", ");
    throw new Error(`No handler for ${method} ${path}. Available: ${available}`);
  }
  // args[0] is path, rest are middleware + handler
  const handlers = route.args.slice(1);
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("Admin Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDatabaseAvailable = true;
    mockDbInstance = createMockDbChain();
  });

  // ===========================================================================
  // GET /stats
  // ===========================================================================

  describe("GET /stats", () => {
    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = createReq();
      const res = createRes();

      await callHandler("GET", "/stats", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "DATABASE_UNAVAILABLE",
          message: "Database unavailable. Please try again shortly.",
        })
      );
    });

    it("returns dashboard stats successfully", async () => {
      // Promise.all receives 6 queries; each resolves to an array with one row
      const chain = mockDbInstance;
      let callCount = 0;
      chain.from.mockImplementation(() => {
        callCount++;
        return chain;
      });
      // The final terminal in the stats chain is .from() for simple counts,
      // and .where() for filtered counts. Both need to resolve to [{ value: N }].
      // Since Promise.all wraps the 6 queries, we make the chain itself thenable.
      // We override select to return a new mini-chain per call so each resolves independently.
      const makeCountChain = (value: number) => {
        const c: any = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        // make it thenable
        c.then = (resolve: any) => resolve([{ value }]);
        return c;
      };

      let selectCall = 0;
      chain.select.mockImplementation(() => {
        selectCall++;
        switch (selectCall) {
          case 1:
            return makeCountChain(100); // users
          case 2:
            return makeCountChain(5); // queued reports
          case 3:
            return makeCountChain(25); // total reports
          case 4:
            return makeCountChain(10); // mod actions
          case 5:
            return makeCountChain(3); // banned
          case 6:
            return makeCountChain(50); // orders
          default:
            return makeCountChain(0);
        }
      });

      const req = createReq();
      const res = createRes();

      await callHandler("GET", "/stats", req, res);

      expect(res.json).toHaveBeenCalledWith({
        totalUsers: 100,
        queuedReports: 5,
        totalReports: 25,
        totalModActions: 10,
        bannedUsers: 3,
        totalOrders: 50,
      });
    });

    it("returns 500 on database error", async () => {
      mockDbInstance.select.mockImplementation(() => {
        throw new Error("DB connection lost");
      });

      const req = createReq();
      const res = createRes();

      await callHandler("GET", "/stats", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "QUERY_FAILED",
          message: "Database query failed.",
        })
      );
    });
  });

  // ===========================================================================
  // GET /users
  // ===========================================================================

  describe("GET /users", () => {
    it("returns users with pagination successfully", async () => {
      const fakeUsers = [
        {
          id: "u-1",
          email: "a@b.com",
          firstName: "Al",
          lastName: "B",
          accountTier: "free",
          trustLevel: 0,
          isActive: true,
          isEmailVerified: true,
          lastLoginAt: null,
          createdAt: new Date(),
        },
        {
          id: "u-2",
          email: "c@d.com",
          firstName: "Ca",
          lastName: "D",
          accountTier: "pro",
          trustLevel: 1,
          isActive: true,
          isEmailVerified: false,
          lastLoginAt: null,
          createdAt: new Date(),
        },
      ];
      const fakeModProfiles = [
        {
          userId: "u-1",
          isBanned: false,
          banExpiresAt: null,
          reputationScore: 100,
          proVerificationStatus: "none",
          isProVerified: false,
        },
      ];

      // First Promise.all has two queries: users list + count
      let selectCall = 0;
      mockDbInstance.select.mockImplementation(() => {
        selectCall++;
        const c: any = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.orderBy = vi.fn().mockReturnValue(c);
        c.limit = vi.fn().mockReturnValue(c);
        c.offset = vi.fn().mockReturnValue(c);
        if (selectCall === 1) {
          // users query
          c.then = (resolve: any) => resolve(fakeUsers);
        } else if (selectCall === 2) {
          // count query
          c.then = (resolve: any) => resolve([{ value: 2 }]);
        } else {
          // mod profiles query
          c.then = (resolve: any) => resolve(fakeModProfiles);
        }
        return c;
      });

      const req = createReq({ query: { page: "1", limit: "20" } });
      const res = createRes();

      await callHandler("GET", "/users", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 2,
          page: 1,
          limit: 20,
        })
      );
      const payload = res.json.mock.calls[0][0];
      expect(payload.users).toHaveLength(2);
      expect(payload.users[0].moderation).toEqual(fakeModProfiles[0]);
      expect(payload.users[1].moderation).toBeNull();
    });

    it("applies search filter", async () => {
      let selectCall = 0;
      mockDbInstance.select.mockImplementation(() => {
        selectCall++;
        const c: any = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.orderBy = vi.fn().mockReturnValue(c);
        c.limit = vi.fn().mockReturnValue(c);
        c.offset = vi.fn().mockReturnValue(c);
        if (selectCall <= 2) {
          c.then =
            selectCall === 1
              ? (resolve: any) => resolve([])
              : (resolve: any) => resolve([{ value: 0 }]);
        } else {
          c.then = (resolve: any) => resolve([]);
        }
        return c;
      });

      const req = createReq({ query: { search: "test", page: "1" } });
      const res = createRes();

      await callHandler("GET", "/users", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          users: [],
          total: 0,
          page: 1,
        })
      );
    });

    it("returns empty list when no users match", async () => {
      let selectCall = 0;
      mockDbInstance.select.mockImplementation(() => {
        selectCall++;
        const c: any = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.orderBy = vi.fn().mockReturnValue(c);
        c.limit = vi.fn().mockReturnValue(c);
        c.offset = vi.fn().mockReturnValue(c);
        c.then =
          selectCall === 1
            ? (resolve: any) => resolve([])
            : (resolve: any) => resolve([{ value: 0 }]);
        return c;
      });

      const req = createReq({ query: {} });
      const res = createRes();

      await callHandler("GET", "/users", req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ users: [], total: 0 }));
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = createReq();
      const res = createRes();

      await callHandler("GET", "/users", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "DATABASE_UNAVAILABLE" })
      );
    });

    it("returns 500 on database error", async () => {
      mockDbInstance.select.mockImplementation(() => {
        throw new Error("query failed");
      });

      const req = createReq({ query: {} });
      const res = createRes();

      await callHandler("GET", "/users", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "QUERY_FAILED",
          message: "Database query failed.",
        })
      );
    });
  });

  // ===========================================================================
  // PATCH /users/:userId/trust-level
  // ===========================================================================

  describe("PATCH /users/:userId/trust-level", () => {
    it("returns 400 for invalid trust level (out of range)", async () => {
      const req = createReq({
        params: { userId: "target-1" },
        body: { trustLevel: 99 },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "INVALID_TRUST_LEVEL" })
      );
    });

    it("returns 400 for non-integer trust level", async () => {
      const req = createReq({
        params: { userId: "target-1" },
        body: { trustLevel: 1.5 },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "INVALID_TRUST_LEVEL" })
      );
    });

    it("returns 400 for missing trust level", async () => {
      const req = createReq({
        params: { userId: "target-1" },
        body: {},
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "INVALID_TRUST_LEVEL" })
      );
    });

    it("updates trust level successfully", async () => {
      // update().set().where().returning() -> [{ id }]
      const updateChain: any = {};
      updateChain.set = vi.fn().mockReturnValue(updateChain);
      updateChain.where = vi.fn().mockReturnValue(updateChain);
      updateChain.returning = vi.fn().mockResolvedValue([{ id: "target-1" }]);
      mockDbInstance.update.mockReturnValue(updateChain);

      // insert().values().onConflictDoUpdate() -> resolves
      const insertChain: any = {};
      insertChain.values = vi.fn().mockReturnValue(insertChain);
      insertChain.onConflictDoUpdate = vi.fn().mockResolvedValue([]);
      mockDbInstance.insert.mockReturnValue(insertChain);

      const req = createReq({
        params: { userId: "target-1" },
        body: { trustLevel: 2 },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          userId: "target-1",
          trustLevel: 2,
        })
      );
    });

    it("returns 404 when user not found", async () => {
      const updateChain: any = {};
      updateChain.set = vi.fn().mockReturnValue(updateChain);
      updateChain.where = vi.fn().mockReturnValue(updateChain);
      updateChain.returning = vi.fn().mockResolvedValue([]);
      mockDbInstance.update.mockReturnValue(updateChain);

      const req = createReq({
        params: { userId: "nonexistent" },
        body: { trustLevel: 1 },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "USER_NOT_FOUND",
          message: "User not found.",
        })
      );
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = createReq({
        params: { userId: "target-1" },
        body: { trustLevel: 1 },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "DATABASE_UNAVAILABLE" })
      );
    });

    it("returns 500 on database error", async () => {
      mockDbInstance.update.mockImplementation(() => {
        throw new Error("connection reset");
      });

      const req = createReq({
        params: { userId: "target-1" },
        body: { trustLevel: 1 },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "UPDATE_FAILED",
          message: "Database update failed.",
        })
      );
    });
  });

  // ===========================================================================
  // PATCH /reports/:reportId/status
  // ===========================================================================

  describe("PATCH /reports/:reportId/status", () => {
    it("returns 400 for invalid status value", async () => {
      const req = createReq({
        params: { reportId: "report-1" },
        body: { status: "invalid_status" },
      });
      const res = createRes();

      await callHandler("PATCH", "/reports/:reportId/status", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "INVALID_STATUS" }));
    });

    it("returns 400 for missing status", async () => {
      const req = createReq({
        params: { reportId: "report-1" },
        body: {},
      });
      const res = createRes();

      await callHandler("PATCH", "/reports/:reportId/status", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "INVALID_STATUS" }));
    });

    it("updates report status successfully", async () => {
      const updateChain: any = {};
      updateChain.set = vi.fn().mockReturnValue(updateChain);
      updateChain.where = vi.fn().mockReturnValue(updateChain);
      updateChain.returning = vi.fn().mockResolvedValue([{ id: "report-1" }]);
      mockDbInstance.update.mockReturnValue(updateChain);

      const req = createReq({
        params: { reportId: "report-1" },
        body: { status: "resolved" },
      });
      const res = createRes();

      await callHandler("PATCH", "/reports/:reportId/status", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          reportId: "report-1",
          status: "resolved",
        })
      );
    });

    it("accepts all valid status values", async () => {
      const statuses = ["queued", "reviewing", "resolved", "dismissed", "escalated"];
      for (const status of statuses) {
        vi.clearAllMocks();
        mockDbInstance = createMockDbChain();

        const updateChain: any = {};
        updateChain.set = vi.fn().mockReturnValue(updateChain);
        updateChain.where = vi.fn().mockReturnValue(updateChain);
        updateChain.returning = vi.fn().mockResolvedValue([{ id: "report-1" }]);
        mockDbInstance.update.mockReturnValue(updateChain);

        const req = createReq({
          params: { reportId: "report-1" },
          body: { status },
        });
        const res = createRes();

        await callHandler("PATCH", "/reports/:reportId/status", req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, status }));
      }
    });

    it("returns 404 when report not found", async () => {
      const updateChain: any = {};
      updateChain.set = vi.fn().mockReturnValue(updateChain);
      updateChain.where = vi.fn().mockReturnValue(updateChain);
      updateChain.returning = vi.fn().mockResolvedValue([]);
      mockDbInstance.update.mockReturnValue(updateChain);

      const req = createReq({
        params: { reportId: "nonexistent" },
        body: { status: "dismissed" },
      });
      const res = createRes();

      await callHandler("PATCH", "/reports/:reportId/status", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "REPORT_NOT_FOUND",
          message: "Report not found.",
        })
      );
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = createReq({
        params: { reportId: "report-1" },
        body: { status: "queued" },
      });
      const res = createRes();

      await callHandler("PATCH", "/reports/:reportId/status", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "DATABASE_UNAVAILABLE" })
      );
    });

    it("returns 500 on database error", async () => {
      mockDbInstance.update.mockImplementation(() => {
        throw new Error("timeout");
      });

      const req = createReq({
        params: { reportId: "report-1" },
        body: { status: "resolved" },
      });
      const res = createRes();

      await callHandler("PATCH", "/reports/:reportId/status", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "UPDATE_FAILED",
          message: "Database update failed.",
        })
      );
    });
  });

  // ===========================================================================
  // GET /audit-logs
  // ===========================================================================

  describe("GET /audit-logs", () => {
    it("returns audit logs successfully", async () => {
      const fakeLogs = [
        { id: "log-1", eventType: "login", userId: "u-1", success: true, createdAt: new Date() },
        { id: "log-2", eventType: "login", userId: "u-2", success: false, createdAt: new Date() },
      ];

      let selectCall = 0;
      mockDbInstance.select.mockImplementation(() => {
        selectCall++;
        const c: any = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.orderBy = vi.fn().mockReturnValue(c);
        c.limit = vi.fn().mockReturnValue(c);
        c.offset = vi.fn().mockReturnValue(c);
        if (selectCall === 1) {
          c.then = (resolve: any) => resolve(fakeLogs);
        } else {
          c.then = (resolve: any) => resolve([{ value: 2 }]);
        }
        return c;
      });

      const req = createReq({ query: {} });
      const res = createRes();

      await callHandler("GET", "/audit-logs", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: fakeLogs,
          total: 2,
          page: 1,
          limit: 50,
        })
      );
    });

    it("applies filters (eventType, userId, success, from, to)", async () => {
      let selectCall = 0;
      mockDbInstance.select.mockImplementation(() => {
        selectCall++;
        const c: any = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.orderBy = vi.fn().mockReturnValue(c);
        c.limit = vi.fn().mockReturnValue(c);
        c.offset = vi.fn().mockReturnValue(c);
        c.then =
          selectCall === 1
            ? (resolve: any) => resolve([])
            : (resolve: any) => resolve([{ value: 0 }]);
        return c;
      });

      const req = createReq({
        query: {
          eventType: "login",
          userId: "u-1",
          success: "true",
          from: "2025-01-01T00:00:00Z",
          to: "2025-12-31T23:59:59Z",
          page: "2",
          limit: "10",
        },
      });
      const res = createRes();

      await callHandler("GET", "/audit-logs", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: [],
          total: 0,
          page: 2,
          limit: 10,
        })
      );
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = createReq();
      const res = createRes();

      await callHandler("GET", "/audit-logs", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "DATABASE_UNAVAILABLE" })
      );
    });

    it("returns 500 on database error", async () => {
      mockDbInstance.select.mockImplementation(() => {
        throw new Error("query error");
      });

      const req = createReq({ query: {} });
      const res = createRes();

      await callHandler("GET", "/audit-logs", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "QUERY_FAILED",
          message: "Database query failed.",
        })
      );
    });
  });

  // ===========================================================================
  // GET /mod-actions
  // ===========================================================================

  describe("GET /mod-actions", () => {
    it("returns mod actions successfully", async () => {
      const fakeActions = [
        { id: "a-1", createdAt: new Date() },
        { id: "a-2", createdAt: new Date() },
      ];

      let selectCall = 0;
      mockDbInstance.select.mockImplementation(() => {
        selectCall++;
        const c: any = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.orderBy = vi.fn().mockReturnValue(c);
        c.limit = vi.fn().mockReturnValue(c);
        c.offset = vi.fn().mockReturnValue(c);
        if (selectCall === 1) {
          c.then = (resolve: any) => resolve(fakeActions);
        } else {
          c.then = (resolve: any) => resolve([{ value: 2 }]);
        }
        return c;
      });

      const req = createReq({ query: {} });
      const res = createRes();

      await callHandler("GET", "/mod-actions", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: fakeActions,
          total: 2,
          page: 1,
          limit: 50,
        })
      );
    });

    it("supports pagination parameters", async () => {
      let selectCall = 0;
      mockDbInstance.select.mockImplementation(() => {
        selectCall++;
        const c: any = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.orderBy = vi.fn().mockReturnValue(c);
        c.limit = vi.fn().mockReturnValue(c);
        c.offset = vi.fn().mockReturnValue(c);
        c.then =
          selectCall === 1
            ? (resolve: any) => resolve([])
            : (resolve: any) => resolve([{ value: 0 }]);
        return c;
      });

      const req = createReq({ query: { page: "3", limit: "25" } });
      const res = createRes();

      await callHandler("GET", "/mod-actions", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: [],
          total: 0,
          page: 3,
          limit: 25,
        })
      );
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = createReq();
      const res = createRes();

      await callHandler("GET", "/mod-actions", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "DATABASE_UNAVAILABLE" })
      );
    });

    it("returns 500 on database error", async () => {
      mockDbInstance.select.mockImplementation(() => {
        throw new Error("connection error");
      });

      const req = createReq({ query: {} });
      const res = createRes();

      await callHandler("GET", "/mod-actions", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "QUERY_FAILED",
          message: "Database query failed.",
        })
      );
    });
  });

  // ===========================================================================
  // PATCH /users/:userId/tier
  // ===========================================================================

  describe("PATCH /users/:userId/tier", () => {
    it("returns 400 for invalid tier value", async () => {
      const req = createReq({
        params: { userId: "target-1" },
        body: { accountTier: "ultra" },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/tier", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "INVALID_TIER" }));
    });

    it("returns 400 for missing accountTier", async () => {
      const req = createReq({
        params: { userId: "target-1" },
        body: {},
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/tier", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "INVALID_TIER" }));
    });

    it("overrides tier to premium successfully", async () => {
      const updateChain: any = {};
      updateChain.set = vi.fn().mockReturnValue(updateChain);
      updateChain.where = vi.fn().mockReturnValue(updateChain);
      updateChain.returning = vi.fn().mockResolvedValue([{ id: "target-1" }]);
      mockDbInstance.update.mockReturnValue(updateChain);

      const req = createReq({
        params: { userId: "target-1" },
        body: { accountTier: "premium" },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/tier", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          userId: "target-1",
          accountTier: "premium",
        })
      );
    });

    it("overrides tier to pro successfully", async () => {
      const updateChain: any = {};
      updateChain.set = vi.fn().mockReturnValue(updateChain);
      updateChain.where = vi.fn().mockReturnValue(updateChain);
      updateChain.returning = vi.fn().mockResolvedValue([{ id: "target-1" }]);
      mockDbInstance.update.mockReturnValue(updateChain);

      const req = createReq({
        params: { userId: "target-1" },
        body: { accountTier: "pro" },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/tier", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          userId: "target-1",
          accountTier: "pro",
        })
      );
    });

    it("overrides tier to free successfully", async () => {
      const updateChain: any = {};
      updateChain.set = vi.fn().mockReturnValue(updateChain);
      updateChain.where = vi.fn().mockReturnValue(updateChain);
      updateChain.returning = vi.fn().mockResolvedValue([{ id: "target-1" }]);
      mockDbInstance.update.mockReturnValue(updateChain);

      const req = createReq({
        params: { userId: "target-1" },
        body: { accountTier: "free" },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/tier", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          userId: "target-1",
          accountTier: "free",
        })
      );
    });

    it("returns 404 when user not found", async () => {
      const updateChain: any = {};
      updateChain.set = vi.fn().mockReturnValue(updateChain);
      updateChain.where = vi.fn().mockReturnValue(updateChain);
      updateChain.returning = vi.fn().mockResolvedValue([]);
      mockDbInstance.update.mockReturnValue(updateChain);

      const req = createReq({
        params: { userId: "nonexistent" },
        body: { accountTier: "pro" },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/tier", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "USER_NOT_FOUND",
          message: "User not found.",
        })
      );
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = createReq({
        params: { userId: "target-1" },
        body: { accountTier: "pro" },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/tier", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "DATABASE_UNAVAILABLE" })
      );
    });

    it("returns 500 on database error", async () => {
      mockDbInstance.update.mockImplementation(() => {
        throw new Error("disk full");
      });

      const req = createReq({
        params: { userId: "target-1" },
        body: { accountTier: "premium" },
      });
      const res = createRes();

      await callHandler("PATCH", "/users/:userId/tier", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "UPDATE_FAILED",
          message: "Database update failed.",
        })
      );
    });
  });
});
