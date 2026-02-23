/**
 * @fileoverview Extended integration tests for notification routes
 *
 * Covers lines NOT hit by notification-routes.test.ts:
 *   - 500 error catch blocks on every endpoint
 *   - Successful GET / (list) with data and pagination
 *   - Successful GET /unread-count with a count
 *   - DELETE /push-token db error branch
 *   - POST /read-all db error branch
 *   - PUT /preferences upsert insert path with db error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks — must be declared before imports
// =============================================================================

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

vi.mock("../../logger", () => ({
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

vi.mock("../../auth/middleware", () => ({
  authenticateUser: vi.fn((_req: any, _res: any, next: any) => next()),
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  customUsers: { id: "id", pushToken: "pushToken", updatedAt: "updatedAt" },
  notifications: {
    id: "id",
    userId: "userId",
    isRead: "isRead",
    readAt: "readAt",
    createdAt: "createdAt",
  },
  notificationPreferences: {
    id: "id",
    userId: "userId",
    updatedAt: "updatedAt",
  },
  DEFAULT_NOTIFICATION_PREFS: {
    pushEnabled: true,
    emailEnabled: true,
    inAppEnabled: true,
    gameNotifications: true,
    challengeNotifications: true,
    turnNotifications: true,
    resultNotifications: true,
    marketingEmails: true,
    weeklyDigest: true,
    quietHoursStart: null,
    quietHoursEnd: null,
  },
}));

// ---- DB mock with sequential results queue ----
let shouldDbThrow = false;

// Queue of results: each call that resolves (from any terminal chain method) shifts one off
let resultQueue: any[] = [];

function nextResult() {
  if (shouldDbThrow) throw new Error("DB boom");
  return Promise.resolve(resultQueue.length > 0 ? resultQueue.shift() : []);
}

// Build a chainable mock where every method returns `this` (the chain)
// and acts as a thenable so await works on any point in the chain.
function makeChain(): any {
  let _resolved = false;
  let _result: any;

  const chain: any = {};
  const methods = [
    "select",
    "from",
    "where",
    "limit",
    "offset",
    "orderBy",
    "set",
    "returning",
    "values",
    "insert",
    "update",
  ];

  for (const m of methods) {
    chain[m] = vi.fn().mockImplementation((..._args: any[]) => {
      return chain;
    });
  }

  // Make it thenable — the first time it's awaited, it resolves by calling nextResult
  chain.then = (resolve: Function, reject?: Function) => {
    if (!_resolved) {
      _resolved = true;
      try {
        _result = nextResult();
      } catch (err) {
        if (reject) return reject(err);
        throw err;
      }
    }
    return Promise.resolve(_result).then(resolve as any, reject as any);
  };

  return chain;
}

vi.mock("../../db", () => ({
  getDb: () => {
    if (shouldDbThrow) throw new Error("Database not configured");
    return {
      select: vi.fn().mockImplementation(() => makeChain()),
      update: vi.fn().mockImplementation(() => makeChain()),
      insert: vi.fn().mockImplementation(() => makeChain()),
    };
  },
}));

// =============================================================================
// Imports after mocks
// =============================================================================

await import("../../routes/notifications");

// =============================================================================
// Helpers
// =============================================================================

function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    currentUser: { id: "user-123" },
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
    throw new Error(
      `No handler found for ${key}. Available: ${Object.keys(_routeHandlers).join(", ")}`
    );
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("Notification Routes — extended coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldDbThrow = false;
    resultQueue = [];
  });

  // ===========================================================================
  // POST /push-token — 500 error path
  // ===========================================================================
  describe("POST /push-token", () => {
    it("returns 500 when db.update throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest({ body: { token: "expo-push-token-abc" } });
      const res = mockResponse();

      await callRoute("POST", "/push-token", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to register push token" })
      );
    });
  });

  // ===========================================================================
  // DELETE /push-token — 500 error path
  // ===========================================================================
  describe("DELETE /push-token", () => {
    it("returns 500 when db.update throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("DELETE", "/push-token", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to remove push token" })
      );
    });
  });

  // ===========================================================================
  // GET /preferences — 500 error path
  // ===========================================================================
  describe("GET /preferences", () => {
    it("returns 500 when db.select throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/preferences", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to get preferences" })
      );
    });
  });

  // ===========================================================================
  // PUT /preferences — 500 error path + nullable quiet hours
  // ===========================================================================
  describe("PUT /preferences", () => {
    it("returns 500 when db throws during upsert", async () => {
      shouldDbThrow = true;
      const req = mockRequest({ body: { pushEnabled: true } });
      const res = mockResponse();

      await callRoute("PUT", "/preferences", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to update preferences" })
      );
    });

    it("accepts nullable quietHoursStart and quietHoursEnd (insert path)", async () => {
      // First query: no existing prefs (triggers insert path)
      resultQueue.push([]);
      const req = mockRequest({
        body: { quietHoursStart: null, quietHoursEnd: null },
      });
      const res = mockResponse();

      await callRoute("PUT", "/preferences", req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // ===========================================================================
  // GET /unread-count — success with count + 500
  // ===========================================================================
  describe("GET /unread-count", () => {
    it("returns count from database", async () => {
      resultQueue.push([{ count: 7 }]);
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/unread-count", req, res);

      expect(res.json).toHaveBeenCalledWith({ count: 7 });
    });

    it("returns 0 when result row is undefined", async () => {
      resultQueue.push([undefined]);
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/unread-count", req, res);

      expect(res.json).toHaveBeenCalledWith({ count: 0 });
    });

    it("returns 500 when db throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/unread-count", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to get unread count" })
      );
    });
  });

  // ===========================================================================
  // GET / (list notifications) — success with data + pagination + 500
  // ===========================================================================
  describe("GET / (list notifications)", () => {
    it("returns paginated notifications", async () => {
      const items = [
        { id: 1, userId: "user-123", message: "Turn played", isRead: false },
        { id: 2, userId: "user-123", message: "Challenge received", isRead: true },
      ];
      // First await: items, second await: count
      resultQueue.push(items, [{ total: 42 }]);

      const req = mockRequest({ query: { limit: "10", offset: "5" } });
      const res = mockResponse();

      await callRoute("GET", "/", req, res);

      expect(res.json).toHaveBeenCalledWith({
        notifications: items,
        total: 42,
        limit: 10,
        offset: 5,
      });
    });

    it("defaults limit to 20 and offset to 0", async () => {
      resultQueue.push([], [{ total: 0 }]);
      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await callRoute("GET", "/", req, res);

      expect(res.json).toHaveBeenCalledWith({
        notifications: [],
        total: 0,
        limit: 20,
        offset: 0,
      });
    });

    it("caps limit at 50", async () => {
      resultQueue.push([], [{ total: 0 }]);
      const req = mockRequest({ query: { limit: "999" } });
      const res = mockResponse();

      await callRoute("GET", "/", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.limit).toBe(50);
    });

    it("returns total 0 when count result is undefined", async () => {
      resultQueue.push([], [undefined]);
      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await callRoute("GET", "/", req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 0 }));
    });

    it("returns 500 when db throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await callRoute("GET", "/", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to list notifications" })
      );
    });
  });

  // ===========================================================================
  // POST /:id/read — 500 error path
  // ===========================================================================
  describe("POST /:id/read", () => {
    it("returns 500 when db throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest({ params: { id: "42" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/read", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to mark as read" })
      );
    });
  });

  // ===========================================================================
  // POST /read-all — 500 error path
  // ===========================================================================
  describe("POST /read-all", () => {
    it("returns 500 when db throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("POST", "/read-all", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to mark all as read" })
      );
    });
  });
});
