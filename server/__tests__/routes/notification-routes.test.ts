/**
 * @fileoverview Integration tests for notification routes
 *
 * Tests the notification route chain:
 * - Push token registration (POST /push-token)
 * - Push token removal (DELETE /push-token)
 * - Notification preferences CRUD (GET/PUT /preferences)
 * - Unread count (GET /unread-count)
 * - Notification list with pagination (GET /)
 * - Mark single as read (POST /:id/read)
 * - Mark all as read (POST /read-all)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks — must be declared before imports
// =============================================================================

// Track route handlers registered on the mock Router
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

// Controllable mock db returns
const mockDbReturns = {
  selectResult: [] as any[],
  insertResult: [] as any[],
  updateResult: [] as any[],
};

let mockIsDatabaseAvailable = true;

vi.mock("../../db", () => ({
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
            }),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.insertResult)),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
        }),
      }),
    }),
  }),
  isDatabaseAvailable: () => mockIsDatabaseAvailable,
}));

// =============================================================================
// Imports after mocks
// =============================================================================

// Import triggers route registration on the mock Router
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

// Route handler caller - uses the mocked Express Router's captured handlers
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

describe("Notification Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.insertResult = [];
    mockDbReturns.updateResult = [];
    mockIsDatabaseAvailable = true;
  });

  // ===========================================================================
  // POST /push-token
  // ===========================================================================

  describe("POST /push-token", () => {
    it("registers a valid push token", async () => {
      const req = mockRequest({ body: { token: "expo-push-token-abc123" } });
      const res = mockResponse();

      await callRoute("POST", "/push-token", req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("rejects invalid body (missing token)", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/push-token", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request" }));
    });

    it("rejects empty token string", async () => {
      const req = mockRequest({ body: { token: "" } });
      const res = mockResponse();

      await callRoute("POST", "/push-token", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({ body: { token: "valid-token" } });
      const res = mockResponse();

      await callRoute("POST", "/push-token", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Database unavailable" })
      );
    });
  });

  // ===========================================================================
  // DELETE /push-token
  // ===========================================================================

  describe("DELETE /push-token", () => {
    it("removes push token on success", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("DELETE", "/push-token", req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("DELETE", "/push-token", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // GET /preferences
  // ===========================================================================

  describe("GET /preferences", () => {
    it("returns saved preferences", async () => {
      mockDbReturns.selectResult = [
        {
          id: 1,
          userId: "user-123",
          updatedAt: new Date(),
          pushEnabled: false,
          emailEnabled: true,
          inAppEnabled: true,
          gameNotifications: true,
          challengeNotifications: false,
          turnNotifications: true,
          resultNotifications: true,
          marketingEmails: false,
          weeklyDigest: true,
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
        },
      ];

      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/preferences", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pushEnabled: false,
          challengeNotifications: false,
          quietHoursStart: "22:00",
        })
      );
      // Should strip internal fields
      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.id).toBeUndefined();
      expect(result.userId).toBeUndefined();
    });

    it("returns defaults when no preferences exist", async () => {
      mockDbReturns.selectResult = [];

      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/preferences", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
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
        })
      );
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/preferences", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // PUT /preferences
  // ===========================================================================

  describe("PUT /preferences", () => {
    it("updates existing preferences", async () => {
      // existing prefs found
      mockDbReturns.selectResult = [{ id: 1 }];

      const req = mockRequest({
        body: { pushEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
      });
      const res = mockResponse();

      await callRoute("PUT", "/preferences", req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("inserts new preferences when none exist", async () => {
      mockDbReturns.selectResult = [];

      const req = mockRequest({ body: { emailEnabled: false } });
      const res = mockResponse();

      await callRoute("PUT", "/preferences", req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("rejects invalid body", async () => {
      const req = mockRequest({ body: { pushEnabled: "not-a-boolean" } });
      const res = mockResponse();

      await callRoute("PUT", "/preferences", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request" }));
    });

    it("rejects invalid quiet hours format", async () => {
      const req = mockRequest({ body: { quietHoursStart: "10pm" } });
      const res = mockResponse();

      await callRoute("PUT", "/preferences", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({ body: { pushEnabled: true } });
      const res = mockResponse();

      await callRoute("PUT", "/preferences", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // GET /unread-count
  // ===========================================================================

  describe("GET /unread-count", () => {
    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/unread-count", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // GET / (list notifications)
  // ===========================================================================

  describe("GET / (list notifications)", () => {
    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await callRoute("GET", "/", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // POST /:id/read
  // ===========================================================================

  describe("POST /:id/read", () => {
    it("marks a notification as read", async () => {
      mockDbReturns.updateResult = [{ id: 42, isRead: true }];

      const req = mockRequest({ params: { id: "42" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/read", req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("returns 404 when notification not found", async () => {
      mockDbReturns.updateResult = [];

      const req = mockRequest({ params: { id: "999" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/read", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Notification not found" })
      );
    });

    it("returns 400 for invalid notification ID", async () => {
      const req = mockRequest({ params: { id: "not-a-number" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/read", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Invalid notification ID" })
      );
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({ params: { id: "42" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/read", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // POST /read-all
  // ===========================================================================

  describe("POST /read-all", () => {
    it("marks all notifications as read", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("POST", "/read-all", req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("POST", "/read-all", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });
});
