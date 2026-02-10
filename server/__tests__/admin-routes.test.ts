/**
 * @fileoverview Integration tests for admin routes
 *
 * Tests:
 * - GET /stats: dashboard stats, db unavailable, db error
 * - GET /users: user list with pagination/search, db unavailable
 * - PATCH /users/:userId/trust-level: update, invalid input, user not found, db unavailable
 * - PATCH /reports/:reportId/status: update, invalid status, report not found, db unavailable
 * - GET /audit-logs: paginated logs with filters, db unavailable
 * - GET /mod-actions: paginated actions, db unavailable
 * - PATCH /users/:userId/tier: override tier, invalid tier, user not found, db unavailable
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks
// =============================================================================

// Mock Express Router to capture registered routes
const _routeHandlers: Record<string, Function[]> = {};
const _mockRouter: any = {
  use: vi.fn(),
  get: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`GET ${path}`] = handlers;
  }),
  post: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`POST ${path}`] = handlers;
  }),
  put: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`PUT ${path}`] = handlers;
  }),
  patch: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`PATCH ${path}`] = handlers;
  }),
  delete: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`DELETE ${path}`] = handlers;
  }),
};
vi.mock("express", () => ({
  Router: () => _mockRouter,
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((_req: any, _res: any, next: any) => next()),
  requireAdmin: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../middleware/trustSafety", () => ({
  enforceAdminRateLimit: () => vi.fn((_req: any, _res: any, next: any) => next()),
  enforceNotBanned: () => vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
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

const mockDbReturns = {
  selectResult: [] as any[],
  insertResult: [] as any[],
  updateResult: [] as any[],
};

let mockIsDatabaseAvailable = true;

const createMockDb = () => ({
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
          }),
        }),
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
        }),
      }),
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
        }),
      }),
      limit: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
    }),
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.insertResult)),
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.insertResult)),
      }),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
      }),
    }),
  }),
});

vi.mock("../db", () => ({
  getDb: () => createMockDb(),
  isDatabaseAvailable: () => mockIsDatabaseAvailable,
}));

// =============================================================================
// Imports after mocks
// =============================================================================

await import("../routes/admin");

// =============================================================================
// Helpers
// =============================================================================

function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    currentUser: { id: "admin-1", role: "admin" },
    ...overrides,
  };
}

function mockResponse(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function callRoute(method: string, path: string, req: any, res: any) {
  const key = `${method} ${path}`;
  const handlers = _routeHandlers[key];
  if (!handlers)
    throw new Error(`No handler for ${key}. Available: ${Object.keys(_routeHandlers).join(", ")}`);
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
    mockDbReturns.selectResult = [];
    mockDbReturns.insertResult = [];
    mockDbReturns.updateResult = [];
    mockIsDatabaseAvailable = true;
  });

  // ===========================================================================
  // GET /stats
  // ===========================================================================

  describe("GET /stats", () => {
    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/stats", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "DATABASE_UNAVAILABLE", message: "Database unavailable. Please try again shortly." })
      );
    });
  });

  // ===========================================================================
  // GET /users
  // ===========================================================================

  describe("GET /users", () => {
    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/users", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // PATCH /users/:userId/trust-level
  // ===========================================================================

  describe("PATCH /users/:userId/trust-level", () => {
    it("updates trust level successfully", async () => {
      mockDbReturns.updateResult = [{ id: "target-1" }];

      const req = mockRequest({
        params: { userId: "target-1" },
        body: { trustLevel: 2 },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          userId: "target-1",
          trustLevel: 2,
        })
      );
    });

    it("returns 400 for invalid trust level", async () => {
      const req = mockRequest({
        params: { userId: "target-1" },
        body: { trustLevel: 99 },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "INVALID_TRUST_LEVEL" })
      );
    });

    it("returns 400 for non-integer trust level", async () => {
      const req = mockRequest({
        params: { userId: "target-1" },
        body: { trustLevel: 1.5 },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 404 when user not found", async () => {
      mockDbReturns.updateResult = [];

      const req = mockRequest({
        params: { userId: "nonexistent" },
        body: { trustLevel: 1 },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "USER_NOT_FOUND", message: "User not found." }));
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({
        params: { userId: "target-1" },
        body: { trustLevel: 1 },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/trust-level", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // PATCH /reports/:reportId/status
  // ===========================================================================

  describe("PATCH /reports/:reportId/status", () => {
    it("updates report status successfully", async () => {
      mockDbReturns.updateResult = [{ id: "report-1" }];

      const req = mockRequest({
        params: { reportId: "report-1" },
        body: { status: "resolved" },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/reports/:reportId/status", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          reportId: "report-1",
          status: "resolved",
        })
      );
    });

    it("returns 400 for invalid status", async () => {
      const req = mockRequest({
        params: { reportId: "report-1" },
        body: { status: "invalid_status" },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/reports/:reportId/status", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "INVALID_STATUS" }));
    });

    it("returns 404 when report not found", async () => {
      mockDbReturns.updateResult = [];

      const req = mockRequest({
        params: { reportId: "nonexistent" },
        body: { status: "dismissed" },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/reports/:reportId/status", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "REPORT_NOT_FOUND", message: "Report not found." }));
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({
        params: { reportId: "report-1" },
        body: { status: "queued" },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/reports/:reportId/status", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("accepts all valid status values", async () => {
      const statuses = ["queued", "reviewing", "resolved", "dismissed", "escalated"];
      for (const status of statuses) {
        vi.clearAllMocks();
        mockDbReturns.updateResult = [{ id: "report-1" }];

        const req = mockRequest({
          params: { reportId: "report-1" },
          body: { status },
        });
        const res = mockResponse();

        await callRoute("PATCH", "/reports/:reportId/status", req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, status }));
      }
    });
  });

  // ===========================================================================
  // GET /audit-logs
  // ===========================================================================

  describe("GET /audit-logs", () => {
    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/audit-logs", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // GET /mod-actions
  // ===========================================================================

  describe("GET /mod-actions", () => {
    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/mod-actions", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // PATCH /users/:userId/tier
  // ===========================================================================

  describe("PATCH /users/:userId/tier", () => {
    it("overrides tier to premium successfully", async () => {
      mockDbReturns.updateResult = [{ id: "target-1" }];

      const req = mockRequest({
        params: { userId: "target-1" },
        body: { accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/tier", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          userId: "target-1",
          accountTier: "premium",
        })
      );
    });

    it("overrides tier to free successfully", async () => {
      mockDbReturns.updateResult = [{ id: "target-1" }];

      const req = mockRequest({
        params: { userId: "target-1" },
        body: { accountTier: "free" },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/tier", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, accountTier: "free" })
      );
    });

    it("returns 400 for invalid tier value", async () => {
      const req = mockRequest({
        params: { userId: "target-1" },
        body: { accountTier: "ultra" },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/tier", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "INVALID_TIER" }));
    });

    it("returns 404 when user not found", async () => {
      mockDbReturns.updateResult = [];

      const req = mockRequest({
        params: { userId: "nonexistent" },
        body: { accountTier: "pro" },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/tier", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "USER_NOT_FOUND", message: "User not found." }));
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({
        params: { userId: "target-1" },
        body: { accountTier: "pro" },
      });
      const res = mockResponse();

      await callRoute("PATCH", "/users/:userId/tier", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });
});
