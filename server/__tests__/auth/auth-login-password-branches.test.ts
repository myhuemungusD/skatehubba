/**
 * @fileoverview Additional branch coverage for auth route files:
 *
 * server/auth/routes/login.ts — lines 51-59 (mock token in production)
 * server/auth/routes/password.ts — lines 39, 139 (password > 72 chars)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ===========================================================================
// Mocks
// ===========================================================================

vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
  },
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockFindUserByFirebaseUid = vi.fn();
const mockCreateUser = vi.fn();
const mockCreateSession = vi.fn();
const mockUpdateLastLogin = vi.fn();
const mockVerifyEmailByUserId = vi.fn();
const mockDeleteSession = vi.fn();
const mockChangePassword = vi.fn();
const mockResetPassword = vi.fn();
const mockFindUserByEmail = vi.fn();
const mockGeneratePasswordResetToken = vi.fn();

vi.mock("../../auth/service", () => ({
  AuthService: {
    findUserByFirebaseUid: (...args: any[]) => mockFindUserByFirebaseUid(...args),
    createUser: (...args: any[]) => mockCreateUser(...args),
    createSession: (...args: any[]) => mockCreateSession(...args),
    updateLastLogin: (...args: any[]) => mockUpdateLastLogin(...args),
    verifyEmailByUserId: (...args: any[]) => mockVerifyEmailByUserId(...args),
    deleteSession: (...args: any[]) => mockDeleteSession(...args),
    changePassword: (...args: any[]) => mockChangePassword(...args),
    resetPassword: (...args: any[]) => mockResetPassword(...args),
    findUserByEmail: (...args: any[]) => mockFindUserByEmail(...args),
    generatePasswordResetToken: (...args: any[]) => mockGeneratePasswordResetToken(...args),
  },
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (_req: any, _res: any, next: any) => next(),
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../../middleware/rateLimit", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../auth/audit", () => ({
  AuditLogger: {
    logLoginSuccess: vi.fn().mockResolvedValue(undefined),
    logLoginFailure: vi.fn().mockResolvedValue(undefined),
    logLogout: vi.fn().mockResolvedValue(undefined),
    logPasswordChanged: vi.fn().mockResolvedValue(undefined),
    logPasswordResetRequested: vi.fn().mockResolvedValue(undefined),
    logSessionsInvalidated: vi.fn().mockResolvedValue(undefined),
  },
  getClientIP: () => "127.0.0.1",
}));

vi.mock("../../auth/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../auth/lockout", () => ({
  LockoutService: {
    checkLockout: vi.fn().mockResolvedValue({ isLocked: false, failedAttempts: 0 }),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    getLockoutMessage: vi.fn().mockReturnValue("Account locked"),
  },
}));

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-uid-1",
        email: "test@example.com",
        name: "Test User",
        email_verified: true,
        picture: null,
      }),
    }),
  },
}));

// ===========================================================================
// Helpers
// ===========================================================================

function createMockApp() {
  const routes: Record<string, Function[]> = {};

  const register =
    (method: string) =>
    (path: string, ...handlers: Function[]) => {
      routes[`${method}:${path}`] = handlers;
    };

  return {
    get: register("GET"),
    post: register("POST"),
    put: register("PUT"),
    delete: register("DELETE"),
    routes,
    async execute(method: string, path: string, req: any, res: any) {
      const chain = routes[`${method}:${path}`];
      if (!chain) throw new Error(`Route not found: ${method} ${path}`);
      const handler = chain[chain.length - 1];
      await handler(req, res);
    },
  };
}

function createReq(overrides: any = {}) {
  return {
    headers: {},
    cookies: {},
    body: {},
    currentUser: undefined,
    ...overrides,
  } as any;
}

function createRes() {
  const res: any = { _statusCode: 200, _jsonData: null, _cookies: {} };
  res.status = vi.fn((code: number) => {
    res._statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res._jsonData = data;
    return res;
  });
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

// ===========================================================================
// Login tests — mock token in production branch
// ===========================================================================

describe("login routes — mock token in production (lines 51-59)", () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createMockApp();
    const { setupLoginRoutes } = await import("../../auth/routes/login");
    setupLoginRoutes(app as any);
  });

  it("rejects mock-google-token in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const req = createReq({
        headers: { authorization: "Bearer mock-google-token" },
        body: {},
      });
      const res = createRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(401);
      expect(res._jsonData).toHaveProperty("error", "Authentication failed");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("uses deterministic UID for mock-google-token in development", async () => {
    mockFindUserByFirebaseUid.mockResolvedValue({
      id: "u-google",
      email: "google@skatehubba.local",
      firstName: "Google",
      lastName: "Skater",
      isEmailVerified: true,
      createdAt: new Date(),
    });
    mockCreateSession.mockResolvedValue({ token: "jwt-google", session: { id: "s1" } });
    mockUpdateLastLogin.mockResolvedValue(undefined);

    const { LockoutService } = await import("../../auth/lockout");
    (LockoutService.recordAttempt as any).mockResolvedValue(undefined);

    const req = createReq({
      headers: { authorization: "Bearer mock-google-token" },
      body: {},
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/login", req, res);

    expect(res._statusCode).toBe(200);
    expect(mockFindUserByFirebaseUid).toHaveBeenCalledWith("mock-google-uid-12345");
  });

  it("creates user with name from decoded token when no firstName/lastName in body", async () => {
    mockFindUserByFirebaseUid.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({
      user: {
        id: "u-new",
        email: "dev@skatehubba.local",
        firstName: "Dev",
        lastName: "Skater",
        isEmailVerified: false,
        createdAt: new Date(),
      },
      emailToken: "token123",
    });
    mockCreateSession.mockResolvedValue({ token: "jwt-new", session: { id: "s2" } });
    mockUpdateLastLogin.mockResolvedValue(undefined);

    const { LockoutService } = await import("../../auth/lockout");
    (LockoutService.recordAttempt as any).mockResolvedValue(undefined);

    const req = createReq({
      headers: { authorization: "Bearer mock-token" },
      body: {}, // no firstName, lastName, isRegistration
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/login", req, res);

    expect(res._statusCode).toBe(200);
    // Name should come from decoded.name split
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Dev",
        lastName: "Skater",
      })
    );
  });

  it("handles logout via Authorization header when no cookie", async () => {
    mockDeleteSession.mockResolvedValue(undefined);

    const req = createReq({
      currentUser: { id: "u1", email: "test@example.com" },
      headers: { authorization: "Bearer session-jwt-token" },
      cookies: {}, // no sessionToken cookie
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/logout", req, res);

    expect(res._jsonData).toHaveProperty("success", true);
    expect(mockDeleteSession).toHaveBeenCalledWith("session-jwt-token");
  });

  it("handles logout error (catch block)", async () => {
    mockDeleteSession.mockRejectedValue(new Error("DB down"));

    const req = createReq({
      currentUser: { id: "u1", email: "test@example.com" },
      cookies: { sessionToken: "tok" },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/logout", req, res);

    expect(res._statusCode).toBe(500);
    expect(res._jsonData).toHaveProperty("error", "Logout failed");
  });

  it("handles get /me error (catch block)", async () => {
    const req = createReq({
      currentUser: null, // Will cause an error when accessing .id
    });
    const res = createRes();

    await app.execute("GET", "/api/auth/me", req, res);

    expect(res._statusCode).toBe(500);
  });
});

// ===========================================================================
// Password routes — password > 72 chars
// ===========================================================================

describe("password routes — password length > 72 (lines 39, 139)", () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createMockApp();
    const { setupPasswordRoutes } = await import("../../auth/routes/password");
    setupPasswordRoutes(app as any);
  });

  it("rejects change-password when newPassword > 72 chars", async () => {
    const longPassword = "Aa1" + "x".repeat(70); // 73 chars
    const req = createReq({
      currentUser: { id: "u1", email: "user@test.com" },
      body: { currentPassword: "OldPass1!", newPassword: longPassword },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/change-password", req, res);

    expect(res._statusCode).toBe(400);
    expect(res._jsonData).toHaveProperty("code", "INVALID_PASSWORD");
    expect(res._jsonData.error).toContain("72");
  });

  it("rejects change-password with weak password (no uppercase)", async () => {
    const req = createReq({
      currentUser: { id: "u1", email: "user@test.com" },
      body: { currentPassword: "OldPass1!", newPassword: "alllowercase1" },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/change-password", req, res);

    expect(res._statusCode).toBe(400);
    expect(res._jsonData).toHaveProperty("code", "WEAK_PASSWORD");
  });

  it("returns error when AuthService.changePassword fails", async () => {
    mockChangePassword.mockResolvedValue({
      success: false,
      message: "Current password incorrect",
    });

    const req = createReq({
      currentUser: { id: "u1", email: "user@test.com" },
      body: { currentPassword: "WrongPass1!", newPassword: "ValidNew1pass" },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/change-password", req, res);

    expect(res._statusCode).toBe(400);
    expect(res._jsonData).toHaveProperty("code", "PASSWORD_CHANGE_FAILED");
  });

  it("rejects reset-password when newPassword > 72 chars", async () => {
    const longPassword = "Aa1" + "x".repeat(70);
    const req = createReq({
      body: { token: "reset-token-hex", newPassword: longPassword },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/reset-password", req, res);

    expect(res._statusCode).toBe(400);
    expect(res._jsonData).toHaveProperty("code", "INVALID_PASSWORD");
  });

  it("rejects reset-password with weak password", async () => {
    const req = createReq({
      body: { token: "reset-token-hex", newPassword: "nouppercase1" },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/reset-password", req, res);

    expect(res._statusCode).toBe(400);
    expect(res._jsonData).toHaveProperty("code", "WEAK_PASSWORD");
  });

  it("rejects reset-password when token is missing", async () => {
    const req = createReq({
      body: { newPassword: "ValidNew1pass" },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/reset-password", req, res);

    expect(res._statusCode).toBe(400);
  });

  it("returns 400 when reset token is invalid/expired", async () => {
    mockResetPassword.mockResolvedValue(null);

    const req = createReq({
      body: { token: "expired-token", newPassword: "ValidNew1pass" },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/reset-password", req, res);

    expect(res._statusCode).toBe(400);
    expect(res._jsonData).toHaveProperty("code", "INVALID_TOKEN");
  });

  it("returns 500 when reset-password throws", async () => {
    mockResetPassword.mockRejectedValue(new Error("DB down"));

    const req = createReq({
      body: { token: "valid-token", newPassword: "ValidNew1pass" },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/reset-password", req, res);

    expect(res._statusCode).toBe(500);
  });

  it("returns 500 when forgot-password throws", async () => {
    mockGeneratePasswordResetToken.mockRejectedValue(new Error("DB down"));

    const req = createReq({
      body: { email: "user@test.com" },
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/forgot-password", req, res);

    expect(res._statusCode).toBe(500);
  });

  it("rejects forgot-password when email missing", async () => {
    const req = createReq({
      body: {},
    });
    const res = createRes();

    await app.execute("POST", "/api/auth/forgot-password", req, res);

    expect(res._statusCode).toBe(400);
  });
});
