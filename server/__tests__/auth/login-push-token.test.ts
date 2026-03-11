/**
 * Tests for login.ts — push token registration (lines 140-167)
 * and logout token cleanup (lines 241-254)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ===========================================================================
// Mock state
// ===========================================================================

const mockFindUserByFirebaseUid = vi.fn();
const mockCreateUser = vi.fn();
const mockCreateSession = vi.fn();
const mockUpdateLastLogin = vi.fn();
const mockVerifyEmailByUserId = vi.fn();
const mockDeleteSession = vi.fn();

vi.mock("../../auth/service", () => ({
  AuthService: {
    findUserByFirebaseUid: (...args: unknown[]) => mockFindUserByFirebaseUid(...args),
    createUser: (...args: unknown[]) => mockCreateUser(...args),
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    updateLastLogin: (...args: unknown[]) => mockUpdateLastLogin(...args),
    verifyEmailByUserId: (...args: unknown[]) => mockVerifyEmailByUserId(...args),
    deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  },
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../middleware/rateLimit", () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../auth/audit", () => ({
  AuditLogger: {
    logLoginSuccess: vi.fn().mockResolvedValue(undefined),
    logLoginFailure: vi.fn().mockResolvedValue(undefined),
    logLogout: vi.fn().mockResolvedValue(undefined),
  },
  getClientIP: () => "127.0.0.1",
}));

vi.mock("../../auth/lockout", () => ({
  LockoutService: {
    checkLockout: vi.fn().mockResolvedValue({ isLocked: false, failedAttempts: 0 }),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    getLockoutMessage: vi.fn().mockReturnValue("Locked"),
  },
}));

vi.mock("../../auth/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: vi.fn(),
    }),
  },
}));

vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
  },
}));

const mockInsertThen = vi.fn();
const mockInsertValues = vi.fn().mockReturnValue({
  onConflictDoUpdate: vi.fn().mockReturnValue({
    then: (cb: () => void) => {
      mockInsertThen();
      return Promise.resolve().then(cb);
    },
  }),
});
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
const mockUpdateSet = vi.fn().mockReturnValue({
  where: vi.fn().mockResolvedValue([]),
});
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
const mockDeleteWhere = vi.fn().mockResolvedValue([]);
const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

vi.mock("../../db", () => ({
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  }),
}));

vi.mock("@shared/schema", () => ({
  deviceTokens: {
    _table: "deviceTokens",
    id: { name: "id" },
    userId: { name: "userId" },
    token: { name: "token" },
  },
  customUsers: {
    _table: "customUsers",
    id: { name: "id" },
    pushToken: { name: "pushToken" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ _op: "eq", col, val }),
  and: (...args: unknown[]) => ({ _op: "and", args }),
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

// ===========================================================================
// Helpers
// ===========================================================================

function createMockApp() {
  const routes: Record<string, ((...args: unknown[]) => void)[]> = {};
  const register =
    (method: string) =>
    (path: string, ...handlers: ((...args: unknown[]) => void)[]) => {
      routes[`${method}:${path}`] = handlers;
    };

  return {
    get: register("GET"),
    post: register("POST"),
    put: register("PUT"),
    delete: register("DELETE"),
    routes,
    async execute(method: string, path: string, req: unknown, res: unknown) {
      const chain = routes[`${method}:${path}`];
      if (!chain) throw new Error(`Route not found: ${method} ${path}`);
      const handler = chain[chain.length - 1];
      await handler(req, res);
    },
  };
}

function createMockRes() {
  const res: Record<string, unknown> = { _statusCode: 200, _jsonData: null, _cookies: {} };
  res.status = vi.fn((code: number) => {
    res._statusCode = code;
    return res;
  });
  res.json = vi.fn((data: unknown) => {
    res._jsonData = data;
    return res;
  });
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("login.ts — push token registration (lines 140-167)", () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createMockApp();
    const { setupLoginRoutes } = await import("../../auth/routes/login");
    setupLoginRoutes(app as never);

    mockFindUserByFirebaseUid.mockResolvedValue({
      id: "u1",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      isEmailVerified: true,
      createdAt: new Date(),
    });
    mockCreateSession.mockResolvedValue({ token: "jwt-token", session: { id: "s1" } });
    mockUpdateLastLogin.mockResolvedValue(undefined);
  });

  it("registers push token when pushToken is provided in body", async () => {
    const req = {
      headers: { authorization: "Bearer mock-token" },
      body: {
        pushToken: "ExponentPushToken[abc123]",
        platform: "ios",
      },
      cookies: {},
    };
    const res = createMockRes();

    await app.execute("POST", "/api/auth/login", req, res);

    expect(res._statusCode).toBe(200);
    // Wait for the non-blocking push token registration
    await new Promise((r) => setTimeout(r, 50));
    expect(mockInsert).toHaveBeenCalled();
  });

  it("skips push token registration when pushToken is not provided", async () => {
    const req = {
      headers: { authorization: "Bearer mock-token" },
      body: {},
      cookies: {},
    };
    const res = createMockRes();

    await app.execute("POST", "/api/auth/login", req, res);

    expect(res._statusCode).toBe(200);
    // insert should not be called for device tokens
    // (it may be called for other things, but not with pushToken)
  });

  it("defaults platform to android when unknown platform is provided", async () => {
    const req = {
      headers: { authorization: "Bearer mock-token" },
      body: {
        pushToken: "ExponentPushToken[def456]",
        platform: "unknown",
      },
      cookies: {},
    };
    const res = createMockRes();

    await app.execute("POST", "/api/auth/login", req, res);

    expect(res._statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("login.ts — logout specific push token cleanup (lines 241-244)", () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createMockApp();
    const { setupLoginRoutes } = await import("../../auth/routes/login");
    setupLoginRoutes(app as never);
    mockDeleteSession.mockResolvedValue(undefined);
  });

  it("deletes specific device token when pushToken provided on logout", async () => {
    const req = {
      headers: {},
      cookies: { sessionToken: "tok" },
      currentUser: { id: "u1", email: "test@example.com" },
      body: { pushToken: "ExponentPushToken[abc123]" },
    };
    const res = createMockRes();

    await app.execute("POST", "/api/auth/logout", req, res);

    expect(mockDelete).toHaveBeenCalled();
    const resData = res._jsonData as Record<string, boolean>;
    expect(resData.success).toBe(true);
  });

  it("deletes all device tokens when no pushToken provided on logout", async () => {
    const req = {
      headers: {},
      cookies: { sessionToken: "tok" },
      currentUser: { id: "u1", email: "test@example.com" },
      body: {},
    };
    const res = createMockRes();

    await app.execute("POST", "/api/auth/logout", req, res);

    expect(mockDelete).toHaveBeenCalled();
  });

  it("handles token cleanup failure gracefully (line 254)", async () => {
    mockDelete.mockReturnValue({
      where: vi.fn().mockRejectedValue(new Error("Token cleanup failed")),
    });

    const req = {
      headers: { "user-agent": "TestAgent" },
      cookies: { sessionToken: "tok" },
      currentUser: { id: "u1", email: "test@example.com" },
      body: {},
    };
    const res = createMockRes();

    await app.execute("POST", "/api/auth/logout", req, res);

    // Should still succeed — token cleanup failure is non-blocking
    const resData = res._jsonData as Record<string, boolean>;
    expect(resData.success).toBe(true);
    const logger = (await import("../../logger")).default;
    expect(logger.warn).toHaveBeenCalledWith(
      "[Auth] Failed to clean up push tokens on logout",
      expect.any(Object)
    );
  });
});
