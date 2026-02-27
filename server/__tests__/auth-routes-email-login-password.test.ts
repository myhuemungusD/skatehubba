/**
 * Coverage tests for auth route files:
 *
 * server/auth/routes/emailVerification.ts — uncovered lines 59, 67, 75-76
 * server/auth/routes/login.ts — uncovered lines 109-110, 155-157
 * server/auth/routes/password.ts — uncovered lines 66-67, 92-95
 *
 * These are all route handlers mounted via Express. We test them by calling
 * the setup functions with a mock Express app, then invoking the registered handlers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ===========================================================================
// Global mocks
// ===========================================================================

vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
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

// Mock AuthService
const mockVerifyEmail = vi.fn();
const mockUpdateUser = vi.fn();
const mockGenerateSecureToken = vi
  .fn()
  .mockReturnValue("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
const mockResetPassword = vi.fn();
const mockFindUserByEmail = vi.fn();
const mockGeneratePasswordResetToken = vi.fn();
const mockFindUserByFirebaseUid = vi.fn();
const mockCreateUser = vi.fn();
const mockCreateSession = vi.fn();
const mockUpdateLastLogin = vi.fn();
const mockVerifyEmailByUserId = vi.fn();
const mockDeleteSession = vi.fn();
const mockChangePassword = vi.fn();

vi.mock("../auth/service", () => ({
  AuthService: {
    verifyEmail: (...args: any[]) => mockVerifyEmail(...args),
    updateUser: (...args: any[]) => mockUpdateUser(...args),
    generateSecureToken: (...args: any[]) => mockGenerateSecureToken(...args),
    resetPassword: (...args: any[]) => mockResetPassword(...args),
    findUserByEmail: (...args: any[]) => mockFindUserByEmail(...args),
    generatePasswordResetToken: (...args: any[]) => mockGeneratePasswordResetToken(...args),
    findUserByFirebaseUid: (...args: any[]) => mockFindUserByFirebaseUid(...args),
    createUser: (...args: any[]) => mockCreateUser(...args),
    createSession: (...args: any[]) => mockCreateSession(...args),
    updateLastLogin: (...args: any[]) => mockUpdateLastLogin(...args),
    verifyEmailByUserId: (...args: any[]) => mockVerifyEmailByUserId(...args),
    deleteSession: (...args: any[]) => mockDeleteSession(...args),
    changePassword: (...args: any[]) => mockChangePassword(...args),
    hashPassword: vi.fn(),
  },
}));

// Mock middleware (passthrough)
vi.mock("../auth/middleware", () => ({
  authenticateUser: (_req: any, _res: any, next: any) => next(),
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../middleware/rateLimit", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middleware/csrf", () => ({
  requireCsrfToken: (_req: any, _res: any, next: any) => next(),
}));

// Mock audit
vi.mock("../auth/audit", () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
    logLoginSuccess: vi.fn().mockResolvedValue(undefined),
    logLoginFailure: vi.fn().mockResolvedValue(undefined),
    logLogout: vi.fn().mockResolvedValue(undefined),
    logPasswordChanged: vi.fn().mockResolvedValue(undefined),
    logPasswordResetRequested: vi.fn().mockResolvedValue(undefined),
    logSessionsInvalidated: vi.fn().mockResolvedValue(undefined),
  },
  AUDIT_EVENTS: {
    EMAIL_VERIFIED: "EMAIL_VERIFIED",
    EMAIL_VERIFICATION_SENT: "EMAIL_VERIFICATION_SENT",
  },
  getClientIP: () => "127.0.0.1",
}));

vi.mock("../services/emailService", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/notificationService", () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../auth/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../auth/lockout", () => ({
  LockoutService: {
    checkLockout: vi.fn().mockResolvedValue({ isLocked: false, failedAttempts: 0 }),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    getLockoutMessage: vi.fn().mockReturnValue("Account locked"),
  },
}));

vi.mock("../admin", () => ({
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
// Helper: mock Express app that captures route registrations
// ===========================================================================

function createMockApp() {
  const routes: Record<string, Function[]> = {};

  const register =
    (method: string) =>
    (path: string, ...handlers: Function[]) => {
      // The last handler is the actual route handler; earlier ones are middleware
      routes[`${method}:${path}`] = handlers;
    };

  return {
    get: register("GET"),
    post: register("POST"),
    put: register("PUT"),
    delete: register("DELETE"),
    routes,
    // Execute the full chain (all middleware + handler)
    async execute(method: string, path: string, req: any, res: any) {
      const chain = routes[`${method}:${path}`];
      if (!chain) throw new Error(`Route not found: ${method} ${path}`);
      // Execute the last handler (route handler) directly since middleware is mocked
      const handler = chain[chain.length - 1];
      await handler(req, res);
    },
  };
}

function createMockReq(overrides: any = {}) {
  return {
    headers: {},
    cookies: {},
    body: {},
    currentUser: undefined,
    ...overrides,
  } as any;
}

function createMockRes() {
  const res: any = {
    _statusCode: 200,
    _jsonData: null,
    _cookies: {} as Record<string, any>,
  };
  res.status = vi.fn((code: number) => {
    res._statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res._jsonData = data;
    return res;
  });
  res.cookie = vi.fn((name: string, value: any, opts: any) => {
    res._cookies[name] = { value, opts };
    return res;
  });
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

// ===========================================================================
// Email verification routes
// ===========================================================================

describe("emailVerification routes — uncovered lines", () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createMockApp();
    const { setupEmailVerificationRoutes } = await import("../auth/routes/emailVerification");
    setupEmailVerificationRoutes(app as any);
  });

  /**
   * Lines 58-59: sendWelcomeEmail .catch path
   * Line 67: notifyUser .catch path
   * These are non-blocking fire-and-forget calls. To exercise the .catch,
   * we make them reject.
   */
  it("handles sendWelcomeEmail rejection gracefully (line 59)", async () => {
    const { sendWelcomeEmail } = await import("../services/emailService");
    (sendWelcomeEmail as any).mockRejectedValue(new Error("Email service down"));

    mockVerifyEmail.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      firstName: "Tony",
    });

    const req = createMockReq({ body: { token: "a".repeat(64) } });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/verify-email", req, res);

    expect(res._jsonData).toHaveProperty("success", true);
    // Wait for the catch to fire
    await new Promise((r) => setTimeout(r, 10));
  });

  it("handles notifyUser rejection gracefully (line 67)", async () => {
    const { notifyUser } = await import("../services/notificationService");
    (notifyUser as any).mockRejectedValue(new Error("Notification service down"));

    mockVerifyEmail.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      firstName: null, // tests "Skater" fallback at line 57
    });

    const req = createMockReq({ body: { token: "b".repeat(64) } });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/verify-email", req, res);

    expect(res._jsonData).toHaveProperty("success", true);
    await new Promise((r) => setTimeout(r, 10));
  });

  /**
   * Lines 75-76: catch block for unexpected errors
   */
  it("returns 500 on unexpected error (lines 75-76)", async () => {
    mockVerifyEmail.mockRejectedValue(new Error("Unexpected DB failure"));

    const req = createMockReq({ body: { token: "c".repeat(64) } });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/verify-email", req, res);

    expect(res._statusCode).toBe(500);
    expect(res._jsonData).toHaveProperty("error", "Email verification failed");
  });
});

// ===========================================================================
// Login routes
// ===========================================================================

describe("login routes — uncovered lines", () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createMockApp();
    const { setupLoginRoutes } = await import("../auth/routes/login");
    setupLoginRoutes(app as any);
  });

  /**
   * Lines 109-110: The sendVerificationEmail .catch path for new registrations
   */
  it("handles sendVerificationEmail rejection for new registration (lines 109-110)", async () => {
    const { sendVerificationEmail } = await import("../auth/email");
    (sendVerificationEmail as any).mockRejectedValue(new Error("Email down"));

    mockFindUserByFirebaseUid.mockResolvedValue(null); // User not found → create
    mockCreateUser.mockResolvedValue({
      user: {
        id: "u-new",
        email: "new@example.com",
        firstName: "New",
        lastName: "User",
        isEmailVerified: false,
        createdAt: new Date(),
      },
      emailToken: "token123",
    });
    mockCreateSession.mockResolvedValue({
      token: "jwt-token",
      session: { id: "s1" },
    });
    mockUpdateLastLogin.mockResolvedValue(undefined);

    const { LockoutService } = await import("../auth/lockout");
    (LockoutService.recordAttempt as any).mockResolvedValue(undefined);

    // Provide mock token in dev mode
    const req = createMockReq({
      headers: { authorization: "Bearer mock-token" },
      body: { firstName: "New", lastName: "User", isRegistration: true },
    });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/login", req, res);

    expect(res._statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
  });

  /**
   * Lines 69-70: Account lockout response
   */
  it("returns 429 when account is locked out (lines 69-70)", async () => {
    const { LockoutService } = await import("../auth/lockout");
    (LockoutService.checkLockout as any).mockResolvedValue({
      isLocked: true,
      failedAttempts: 5,
      unlockAt: new Date(Date.now() + 900000),
    });
    (LockoutService.getLockoutMessage as any).mockReturnValue(
      "Account locked. Try again in 15 minutes."
    );

    mockFindUserByFirebaseUid.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({
      user: {
        id: "u-locked",
        email: "locked@example.com",
        firstName: "Locked",
        lastName: "User",
        isEmailVerified: false,
        createdAt: new Date(),
      },
      emailToken: "token123",
    });
    mockCreateSession.mockResolvedValue({ token: "jwt", session: { id: "s1" } });

    const req = createMockReq({
      headers: { authorization: "Bearer mock-token" },
      body: {},
    });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/login", req, res);

    expect(res._statusCode).toBe(429);
    expect(res._jsonData).toHaveProperty("code", "ACCOUNT_LOCKED");
  });

  /**
   * Lines 111-112: Email verification sync when Firebase says verified but DB doesn't
   * Must use a real (non-mock) token so it goes through admin.auth().verifyIdToken
   * which returns email_verified: true from the mock.
   */
  it("syncs email verification from Firebase to DB (lines 111-112)", async () => {
    // User exists but isEmailVerified is false in our DB
    mockFindUserByFirebaseUid.mockResolvedValue({
      id: "u-sync",
      email: "sync@example.com",
      firstName: "Sync",
      lastName: "User",
      isEmailVerified: false, // DB says not verified
      createdAt: new Date(),
    });
    mockVerifyEmailByUserId.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue({ token: "jwt-sync", session: { id: "s2" } });
    mockUpdateLastLogin.mockResolvedValue(undefined);

    const { LockoutService } = await import("../auth/lockout");
    (LockoutService.checkLockout as any).mockResolvedValue({ isLocked: false, failedAttempts: 0 });
    (LockoutService.recordAttempt as any).mockResolvedValue(undefined);

    // Use a real (non-mock) token so verifyIdToken is called, returning email_verified: true
    const req = createMockReq({
      headers: { authorization: "Bearer real-firebase-id-token" },
      body: {},
    });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/login", req, res);

    expect(res._statusCode).toBe(200);
    expect(mockVerifyEmailByUserId).toHaveBeenCalledWith("u-sync");
  });

  /**
   * Lines 155-157: Outer catch block — returns 500
   */
  it("returns 500 on outer exception (lines 155-157)", async () => {
    // Make the headers.authorization access throw
    const req = createMockReq({
      headers: {
        get authorization() {
          throw new Error("Catastrophic header failure");
        },
        "user-agent": "test",
      },
    });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/login", req, res);

    expect(res._statusCode).toBe(500);
    expect(res._jsonData).toHaveProperty("error", "Authentication failed");
  });
});

// ===========================================================================
// Password routes
// ===========================================================================

describe("password routes — uncovered lines", () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createMockApp();
    const { setupPasswordRoutes } = await import("../auth/routes/password");
    setupPasswordRoutes(app as any);
  });

  /**
   * Lines 66-67: change-password catch block — returns 500
   */
  it("returns 500 on change-password error (lines 66-67)", async () => {
    mockChangePassword.mockRejectedValue(new Error("DB error"));

    const req = createMockReq({
      currentUser: { id: "u1", email: "user@test.com" },
      body: { currentPassword: "Old1pass!", newPassword: "New1pass!" },
    });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/change-password", req, res);

    expect(res._statusCode).toBe(500);
    expect(res._jsonData).toHaveProperty("error", "Password change failed");
  });

  /**
   * Lines 92-95: forgot-password sends branded reset email when user exists
   */
  it("sends branded reset email when user exists (lines 92-95)", async () => {
    mockGeneratePasswordResetToken.mockResolvedValue("reset-token-hex-string");
    mockFindUserByEmail.mockResolvedValue({
      id: "u1",
      email: "user@test.com",
      firstName: "Tony",
    });

    const { sendPasswordResetEmail } = await import("../auth/email");

    const req = createMockReq({
      body: { email: "user@test.com" },
    });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/forgot-password", req, res);

    expect(res._jsonData).toHaveProperty("success", true);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      "user@test.com",
      "reset-token-hex-string",
      "Tony"
    );
  });

  it("handles sendPasswordResetEmail rejection gracefully", async () => {
    mockGeneratePasswordResetToken.mockResolvedValue("reset-token-hex-string");
    mockFindUserByEmail.mockResolvedValue({
      id: "u1",
      email: "user@test.com",
      firstName: null, // Tests "Skater" fallback at line 93
    });

    const { sendPasswordResetEmail } = await import("../auth/email");
    (sendPasswordResetEmail as any).mockRejectedValue(new Error("Email down"));

    const req = createMockReq({
      body: { email: "user@test.com" },
    });
    const res = createMockRes();

    await app.execute("POST", "/api/auth/forgot-password", req, res);

    // Should still return success (prevent enumeration)
    expect(res._jsonData).toHaveProperty("success", true);
    await new Promise((r) => setTimeout(r, 10));
  });
});
