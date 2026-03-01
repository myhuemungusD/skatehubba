/**
 * Branch coverage tests for server/auth/routes/login.ts
 *
 * Targets remaining uncovered branches including:
 * - Lines 53-59: mock token rejected in production mode
 * - Optional chaining / nullish coalescing branches (decoded.name?.split, decoded.email || ...)
 * - Empty email path (skips lockout check and recordAttempt)
 * - Firebase token verification failure (inner catch)
 * - isRegistration false path (no verification email sent for non-registration)
 * - decoded.picture truthy path
 * - Logout via Authorization header (no cookie)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ===========================================================================
// Shared mock state
// ===========================================================================

const mockFindUserByFirebaseUid = vi.fn();
const mockCreateUser = vi.fn();
const mockCreateSession = vi.fn();
const mockUpdateLastLogin = vi.fn();
const mockVerifyEmailByUserId = vi.fn();
const mockDeleteSession = vi.fn();

vi.mock("../../auth/service", () => ({
  AuthService: {
    findUserByFirebaseUid: (...args: any[]) => mockFindUserByFirebaseUid(...args),
    createUser: (...args: any[]) => mockCreateUser(...args),
    createSession: (...args: any[]) => mockCreateSession(...args),
    updateLastLogin: (...args: any[]) => mockUpdateLastLogin(...args),
    verifyEmailByUserId: (...args: any[]) => mockVerifyEmailByUserId(...args),
    deleteSession: (...args: any[]) => mockDeleteSession(...args),
  },
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../middleware/rateLimit", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
}));

const mockAuditLogLoginFailure = vi.fn().mockResolvedValue(undefined);
const mockAuditLogLoginSuccess = vi.fn().mockResolvedValue(undefined);
const mockAuditLogLogout = vi.fn().mockResolvedValue(undefined);

vi.mock("../../auth/audit", () => ({
  AuditLogger: {
    logLoginSuccess: (...args: any[]) => mockAuditLogLoginSuccess(...args),
    logLoginFailure: (...args: any[]) => mockAuditLogLoginFailure(...args),
    logLogout: (...args: any[]) => mockAuditLogLogout(...args),
  },
  getClientIP: () => "127.0.0.1",
}));

const mockCheckLockout = vi.fn().mockResolvedValue({ isLocked: false, failedAttempts: 0 });
const mockRecordAttempt = vi.fn().mockResolvedValue(undefined);
const mockGetLockoutMessage = vi.fn().mockReturnValue("Account locked");

vi.mock("../../auth/lockout", () => ({
  LockoutService: {
    checkLockout: (...args: any[]) => mockCheckLockout(...args),
    recordAttempt: (...args: any[]) => mockRecordAttempt(...args),
    getLockoutMessage: (...args: any[]) => mockGetLockoutMessage(...args),
  },
}));

const mockSendVerificationEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("../../auth/email", () => ({
  sendVerificationEmail: (...args: any[]) => mockSendVerificationEmail(...args),
}));

const mockVerifyIdToken = vi.fn();

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: (...args: any[]) => mockVerifyIdToken(...args),
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

// Default successful user setup
function setupSuccessfulLogin(userOverrides: any = {}) {
  const defaultUser = {
    id: "u1",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    isEmailVerified: true,
    createdAt: new Date(),
    ...userOverrides,
  };
  mockFindUserByFirebaseUid.mockResolvedValue(defaultUser);
  mockCreateSession.mockResolvedValue({ token: "jwt-token", session: { id: "s1" } });
  mockUpdateLastLogin.mockResolvedValue(undefined);
  mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });
  mockRecordAttempt.mockResolvedValue(undefined);
  return defaultUser;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("login.ts — branch coverage", () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createMockApp();
    const { setupLoginRoutes } = await import("../../auth/routes/login");
    setupLoginRoutes(app as any);
  });

  // =========================================================================
  // Lines 53-59: Mock token rejected in production
  // =========================================================================
  describe("mock token in production (lines 53-59)", () => {
    it("rejects mock-token when NODE_ENV is production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const req = createMockReq({
          headers: { authorization: "Bearer mock-token" },
          body: {},
        });
        const res = createMockRes();

        await app.execute("POST", "/api/auth/login", req, res);

        expect(res._statusCode).toBe(401);
        expect(res._jsonData).toHaveProperty("error", "Authentication failed");
        expect(mockAuditLogLoginFailure).toHaveBeenCalledWith(
          null,
          "127.0.0.1",
          undefined,
          "Mock token rejected in production"
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("rejects mock-google-token when NODE_ENV is production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const req = createMockReq({
          headers: { authorization: "Bearer mock-google-token" },
          body: {},
        });
        const res = createMockRes();

        await app.execute("POST", "/api/auth/login", req, res);

        expect(res._statusCode).toBe(401);
        expect(res._jsonData).toHaveProperty("error", "Authentication failed");
        expect(mockAuditLogLoginFailure).toHaveBeenCalledWith(
          null,
          "127.0.0.1",
          undefined,
          "Mock token rejected in production"
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // =========================================================================
  // Firebase token verification failure (inner catch, lines 149-152)
  // =========================================================================
  describe("Firebase token verification failure (inner catch)", () => {
    it("returns 401 when verifyIdToken throws", async () => {
      mockVerifyIdToken.mockRejectedValue(new Error("Firebase: Token expired"));

      const req = createMockReq({
        headers: { authorization: "Bearer real-firebase-token" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(401);
      expect(res._jsonData).toHaveProperty("error", "Authentication failed");
      expect(mockAuditLogLoginFailure).toHaveBeenCalledWith(
        null,
        "127.0.0.1",
        undefined,
        "Invalid Firebase token"
      );
    });
  });

  // =========================================================================
  // New user creation with no decoded.name and no email (optional chaining branches)
  // =========================================================================
  describe("new user creation — fallback branches", () => {
    it("uses 'User' fallback when decoded.name is undefined and no firstName provided", async () => {
      // Mock token decodes without name or email
      mockFindUserByFirebaseUid.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        user: {
          id: "u-new",
          email: "usermock-uid@firebase.local",
          firstName: "User",
          lastName: "",
          isEmailVerified: false,
          createdAt: new Date(),
        },
        emailToken: "tok",
      });
      mockCreateSession.mockResolvedValue({ token: "jwt", session: { id: "s1" } });
      mockUpdateLastLogin.mockResolvedValue(undefined);
      mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });

      // Use mock-token (test env) which decodes to { uid, email, name } —
      // but we need name to be undefined. Override by using real token.
      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-no-name",
        // no email — tests decoded.email || fallback
        // no name — tests decoded.name?.split fallback
        email_verified: false,
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-firebase-token-no-name" },
        body: {}, // no firstName, no lastName
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "User",
          lastName: "",
          email: expect.stringContaining("firebase.local"),
          isEmailVerified: false,
        })
      );
    });

    it("uses firstName from body when decoded.name is undefined", async () => {
      mockFindUserByFirebaseUid.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        user: {
          id: "u-named",
          email: "named@example.com",
          firstName: "Tony",
          lastName: "Hawk",
          isEmailVerified: false,
          createdAt: new Date(),
        },
        emailToken: "tok",
      });
      mockCreateSession.mockResolvedValue({ token: "jwt", session: { id: "s1" } });
      mockUpdateLastLogin.mockResolvedValue(undefined);
      mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-2",
        email: "named@example.com",
        // no name
        email_verified: false,
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-2" },
        body: { firstName: "Tony", lastName: "Hawk" },
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Tony",
          lastName: "Hawk",
        })
      );
    });

    it("uses decoded.name for firstName/lastName when body fields are empty", async () => {
      mockFindUserByFirebaseUid.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        user: {
          id: "u-from-name",
          email: "fromname@example.com",
          firstName: "John",
          lastName: "Doe Smith",
          isEmailVerified: false,
          createdAt: new Date(),
        },
        emailToken: "tok",
      });
      mockCreateSession.mockResolvedValue({ token: "jwt", session: { id: "s1" } });
      mockUpdateLastLogin.mockResolvedValue(undefined);
      mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-3",
        email: "fromname@example.com",
        name: "John Doe Smith",
        email_verified: false,
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-3" },
        body: {}, // no firstName/lastName → falls back to decoded.name splitting
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "John",
          lastName: "Doe Smith",
        })
      );
    });
  });

  // =========================================================================
  // Empty email — skips lockout check and recordAttempt
  // =========================================================================
  describe("empty email path", () => {
    it("skips lockout check and recordAttempt when decoded.email is falsy", async () => {
      setupSuccessfulLogin({ email: "" });

      // Use a non-mock token so verifyIdToken is called
      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-no-email",
        // no email → email = "" → skips lockout check
        email_verified: false,
      });

      // Existing user with empty email
      mockFindUserByFirebaseUid.mockResolvedValue({
        id: "u-no-email",
        email: "",
        firstName: "NoEmail",
        lastName: "User",
        isEmailVerified: false,
        createdAt: new Date(),
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-no-email" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      // lockout check should NOT have been called since email is empty
      expect(mockCheckLockout).not.toHaveBeenCalled();
      // recordAttempt should NOT have been called since email is empty
      expect(mockRecordAttempt).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // isRegistration falsy — no verification email sent
  // =========================================================================
  describe("non-registration login (new user)", () => {
    it("does not send verification email when isRegistration is false", async () => {
      mockFindUserByFirebaseUid.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        user: {
          id: "u-noreg",
          email: "noreg@example.com",
          firstName: "NoReg",
          lastName: "User",
          isEmailVerified: false,
          createdAt: new Date(),
        },
        emailToken: "tok123",
      });
      mockCreateSession.mockResolvedValue({ token: "jwt", session: { id: "s1" } });
      mockUpdateLastLogin.mockResolvedValue(undefined);
      mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });
      mockRecordAttempt.mockResolvedValue(undefined);

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-noreg",
        email: "noreg@example.com",
        name: "NoReg User",
        email_verified: false,
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-noreg" },
        body: { isRegistration: false }, // not a registration
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // decoded.picture truthy — photoUrl returned
  // =========================================================================
  describe("decoded.picture present", () => {
    it("returns photoUrl from decoded.picture when present", async () => {
      setupSuccessfulLogin();

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-pic",
        email: "pic@example.com",
        name: "Pic User",
        email_verified: true,
        picture: "https://example.com/avatar.jpg",
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-pic" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.user.photoUrl).toBe("https://example.com/avatar.jpg");
    });
  });

  // =========================================================================
  // user-agent header present vs missing
  // =========================================================================
  describe("user-agent header", () => {
    it("passes user-agent to audit logger when header is present", async () => {
      setupSuccessfulLogin();

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-ua",
        email: "ua@example.com",
        name: "UA User",
        email_verified: true,
      });

      const req = createMockReq({
        headers: {
          authorization: "Bearer real-token-ua",
          "user-agent": "TestBrowser/1.0",
        },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockAuditLogLoginSuccess).toHaveBeenCalledWith(
        "u1",
        "test@example.com",
        "127.0.0.1",
        "TestBrowser/1.0",
        "firebase"
      );
    });
  });

  // =========================================================================
  // Missing Bearer prefix — returns 401
  // =========================================================================
  describe("missing bearer prefix", () => {
    it("returns 401 when authorization header lacks Bearer prefix", async () => {
      const req = createMockReq({
        headers: { authorization: "Basic abc123" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(401);
      expect(mockAuditLogLoginFailure).toHaveBeenCalledWith(
        null,
        "127.0.0.1",
        undefined,
        "Missing Firebase ID token"
      );
    });

    it("returns 401 when authorization header is empty", async () => {
      const req = createMockReq({
        headers: {},
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(401);
    });
  });

  // =========================================================================
  // Lockout with isLocked true but unlockAt falsy
  // =========================================================================
  describe("lockout edge cases", () => {
    it("does not return 429 when isLocked is true but unlockAt is null", async () => {
      mockCheckLockout.mockResolvedValue({
        isLocked: true,
        failedAttempts: 5,
        unlockAt: null, // unlockAt is falsy — should NOT trigger lockout response
      });

      setupSuccessfulLogin();
      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-lock",
        email: "lock@example.com",
        name: "Lock User",
        email_verified: true,
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-lock" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      // Should proceed to login because unlockAt is falsy
      expect(res._statusCode).toBe(200);
    });

    it("returns 429 when account is locked with a valid unlockAt (lines 70-76)", async () => {
      const unlockAt = new Date(Date.now() + 900000);
      mockCheckLockout.mockResolvedValue({
        isLocked: true,
        failedAttempts: 5,
        unlockAt,
      });
      mockGetLockoutMessage.mockReturnValue("Account locked. Try again in 15 minutes.");

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-locked",
        email: "locked@example.com",
        name: "Locked User",
        email_verified: true,
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-locked" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(429);
      expect(res._jsonData).toHaveProperty("code", "ACCOUNT_LOCKED");
      expect(res._jsonData).toHaveProperty("unlockAt", unlockAt.toISOString());
      expect(mockAuditLogLoginFailure).toHaveBeenCalledWith(
        "locked@example.com",
        "127.0.0.1",
        undefined,
        "Account locked"
      );
    });
  });

  // =========================================================================
  // isRegistration true but email_verified is true — no email sent
  // =========================================================================
  describe("registration with email already verified", () => {
    it("does not send verification email when decoded.email_verified is true", async () => {
      mockFindUserByFirebaseUid.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        user: {
          id: "u-verified-reg",
          email: "verified-reg@example.com",
          firstName: "Verified",
          lastName: "Reg",
          isEmailVerified: true,
          createdAt: new Date(),
        },
        emailToken: "tok",
      });
      mockCreateSession.mockResolvedValue({ token: "jwt", session: { id: "s1" } });
      mockUpdateLastLogin.mockResolvedValue(undefined);
      mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });
      mockRecordAttempt.mockResolvedValue(undefined);

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-vreg",
        email: "verified-reg@example.com",
        name: "Verified Reg",
        email_verified: true, // already verified
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-vreg" },
        body: { isRegistration: true }, // is registration but email_verified is true
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Registration with no decoded.email — no verification email sent
  // =========================================================================
  describe("registration with no email", () => {
    it("does not send verification email when decoded.email is falsy", async () => {
      mockFindUserByFirebaseUid.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        user: {
          id: "u-no-email-reg",
          email: "userfirebase@firebase.local",
          firstName: "User",
          lastName: "",
          isEmailVerified: false,
          createdAt: new Date(),
        },
        emailToken: "tok",
      });
      mockCreateSession.mockResolvedValue({ token: "jwt", session: { id: "s1" } });
      mockUpdateLastLogin.mockResolvedValue(undefined);
      mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-noemail",
        // no email
        email_verified: false,
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-noemail" },
        body: { isRegistration: true },
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Email verification sync
  // =========================================================================
  describe("email verification sync", () => {
    it("syncs email verification when Firebase says verified but DB does not (lines 109-110)", async () => {
      // User exists in DB with isEmailVerified: false
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
      mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });
      mockRecordAttempt.mockResolvedValue(undefined);

      // Firebase token says email_verified: true
      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-sync",
        email: "sync@example.com",
        name: "Sync User",
        email_verified: true, // Firebase says verified
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-firebase-token-sync" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockVerifyEmailByUserId).toHaveBeenCalledWith("u-sync");
    });

    it("does not call verifyEmailByUserId when user.isEmailVerified is already true", async () => {
      setupSuccessfulLogin({ isEmailVerified: true });

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-synced",
        email: "synced@example.com",
        name: "Synced User",
        email_verified: true,
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-synced" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockVerifyEmailByUserId).not.toHaveBeenCalled();
    });

    it("does not sync when decoded.email_verified is false", async () => {
      setupSuccessfulLogin({ isEmailVerified: false });

      mockVerifyIdToken.mockResolvedValue({
        uid: "firebase-uid-notver",
        email: "notver@example.com",
        name: "NotVer User",
        email_verified: false,
      });

      const req = createMockReq({
        headers: { authorization: "Bearer real-token-notver" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      expect(mockVerifyEmailByUserId).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Mock google token in test mode — exercises isGoogle = true branch (line 45)
  // =========================================================================
  describe("mock-google-token in test mode", () => {
    it("uses google mock user data when mock-google-token is provided", async () => {
      mockFindUserByFirebaseUid.mockResolvedValue({
        id: "u-google",
        email: "google@skatehubba.local",
        firstName: "Google",
        lastName: "Skater",
        isEmailVerified: false,
        createdAt: new Date(),
      });
      mockCreateSession.mockResolvedValue({ token: "jwt-google", session: { id: "s1" } });
      mockUpdateLastLogin.mockResolvedValue(undefined);
      mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });
      mockRecordAttempt.mockResolvedValue(undefined);

      const req = createMockReq({
        headers: { authorization: "Bearer mock-google-token" },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(200);
      // checkLockout should be called with the google mock email
      expect(mockCheckLockout).toHaveBeenCalledWith("google@skatehubba.local");
    });
  });

  // =========================================================================
  // Logout via Authorization header (no cookie, lines 198-200)
  // =========================================================================
  describe("logout via Authorization header", () => {
    it("deletes session from Authorization header when no cookie is present", async () => {
      mockDeleteSession.mockResolvedValue(undefined);

      const req = createMockReq({
        headers: {
          authorization: "Bearer session-token-from-header",
          "user-agent": "TestAgent",
        },
        cookies: {}, // no sessionToken cookie
        currentUser: { id: "u-logout", email: "logout@example.com" },
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/logout", req, res);

      expect(mockDeleteSession).toHaveBeenCalledWith("session-token-from-header");
      expect(res._jsonData).toHaveProperty("success", true);
    });

    it("does not delete session when neither cookie nor auth header is present", async () => {
      const req = createMockReq({
        headers: {},
        cookies: {},
        currentUser: { id: "u-logout2", email: "logout2@example.com" },
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/logout", req, res);

      expect(mockDeleteSession).not.toHaveBeenCalled();
      expect(res._jsonData).toHaveProperty("success", true);
    });
  });

  // =========================================================================
  // Logout via cookie (line 197)
  // =========================================================================
  describe("logout via cookie", () => {
    it("deletes session from cookie when cookie is present", async () => {
      mockDeleteSession.mockResolvedValue(undefined);

      const req = createMockReq({
        headers: {},
        cookies: { sessionToken: "cookie-session-token" },
        currentUser: { id: "u-logout3", email: "logout3@example.com" },
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/logout", req, res);

      expect(mockDeleteSession).toHaveBeenCalledWith("cookie-session-token");
      expect(res._jsonData).toHaveProperty("success", true);
    });
  });

  // =========================================================================
  // Authorization header with null value — ?? "" branch
  // =========================================================================
  describe("authorization header nullish coalescing", () => {
    it("treats null authorization header as empty string", async () => {
      const req = createMockReq({
        headers: { authorization: null },
        body: {},
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);

      expect(res._statusCode).toBe(401);
      expect(mockAuditLogLoginFailure).toHaveBeenCalledWith(
        null,
        "127.0.0.1",
        undefined,
        "Missing Firebase ID token"
      );
    });
  });

  // =========================================================================
  // GET /api/auth/me — catch block (lines 177-182)
  // =========================================================================
  describe("GET /api/auth/me error handling", () => {
    it("returns 500 when an error occurs in the /me handler", async () => {
      // Provide a currentUser that throws on property access
      const badUser = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "id") {
              throw new Error("Simulated user object error");
            }
            return undefined;
          },
        }
      );

      const req = createMockReq({
        currentUser: badUser,
      });
      const res = createMockRes();

      await app.execute("GET", "/api/auth/me", req, res);

      expect(res._statusCode).toBe(500);
      expect(res._jsonData).toHaveProperty("error", "Failed to get user information");
    });

    it("returns user data successfully for the /me endpoint", async () => {
      const req = createMockReq({
        currentUser: {
          id: "u-me",
          email: "me@example.com",
          firstName: "Me",
          lastName: "User",
          isEmailVerified: true,
          accountTier: "free",
          lastLoginAt: new Date(),
          createdAt: new Date(),
        },
      });
      const res = createMockRes();

      await app.execute("GET", "/api/auth/me", req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.user).toHaveProperty("id", "u-me");
      expect(res._jsonData.user).toHaveProperty("email", "me@example.com");
    });
  });

  // =========================================================================
  // POST /api/auth/logout — catch block (lines 218-223)
  // =========================================================================
  describe("POST /api/auth/logout error handling", () => {
    it("returns 500 when session deletion throws", async () => {
      mockDeleteSession.mockRejectedValue(new Error("DB connection lost"));

      const req = createMockReq({
        cookies: { sessionToken: "some-token" },
        currentUser: { id: "u-err", email: "err@example.com" },
        headers: { "user-agent": "TestAgent" },
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/logout", req, res);

      expect(res._statusCode).toBe(500);
      expect(res._jsonData).toHaveProperty("error", "Logout failed");
    });
  });

  // =========================================================================
  // Logout user-agent fallback (line 188)
  // =========================================================================
  describe("logout user-agent fallback", () => {
    it("passes undefined user-agent when header is missing", async () => {
      mockDeleteSession.mockResolvedValue(undefined);

      const req = createMockReq({
        headers: {},
        cookies: { sessionToken: "tok" },
        currentUser: { id: "u-no-ua", email: "noua@example.com" },
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/logout", req, res);

      expect(mockAuditLogLogout).toHaveBeenCalledWith(
        "u-no-ua",
        "noua@example.com",
        "127.0.0.1",
        undefined
      );
    });
  });

  // =========================================================================
  // sendVerificationEmail .catch path (lines 100-102)
  // =========================================================================
  describe("sendVerificationEmail rejection on new registration", () => {
    it("handles sendVerificationEmail rejection gracefully (lines 100-102)", async () => {
      // Create a controllable promise to track when the catch fires
      let rejectFn: (err: Error) => void;
      const emailPromise = new Promise<void>((_resolve, reject) => {
        rejectFn = reject;
      });
      mockSendVerificationEmail.mockReturnValue(emailPromise);

      mockFindUserByFirebaseUid.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        user: {
          id: "u-new-fail",
          email: "newfail@example.com",
          firstName: "New",
          lastName: "Fail",
          isEmailVerified: false,
          createdAt: new Date(),
        },
        emailToken: "token123",
      });
      mockCreateSession.mockResolvedValue({ token: "jwt", session: { id: "s1" } });
      mockUpdateLastLogin.mockResolvedValue(undefined);
      mockCheckLockout.mockResolvedValue({ isLocked: false, failedAttempts: 0 });
      mockRecordAttempt.mockResolvedValue(undefined);

      // Use mock-token in test mode (decoded has no email_verified, but email is present)
      const req = createMockReq({
        headers: { authorization: "Bearer mock-token" },
        body: { firstName: "New", lastName: "Fail", isRegistration: true },
      });
      const res = createMockRes();

      await app.execute("POST", "/api/auth/login", req, res);
      expect(res._statusCode).toBe(200);

      // Now trigger the rejection so the .catch() callback executes
      rejectFn!(new Error("Email service down"));

      // Flush all microtasks so the .catch callback runs
      await new Promise((r) => setTimeout(r, 50));

      const logger = (await import("../../logger")).default;
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to send verification email",
        expect.objectContaining({ error: "Error: Email service down" })
      );
    });
  });

  // =========================================================================
  // Outer catch block (lines 154-158)
  // =========================================================================
  describe("outer exception handler", () => {
    it("returns 500 on outer exception", async () => {
      // Make headers.authorization throw to trigger outer catch
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

  // =========================================================================
  // Secure cookie in production mode (line 130)
  // =========================================================================
  describe("secure cookie in production", () => {
    it("sets secure cookie when NODE_ENV is production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        setupSuccessfulLogin();
        mockVerifyIdToken.mockResolvedValue({
          uid: "firebase-uid-prod",
          email: "prod@example.com",
          name: "Prod User",
          email_verified: true,
        });

        const req = createMockReq({
          headers: { authorization: "Bearer real-firebase-token-prod" },
          body: {},
        });
        const res = createMockRes();

        await app.execute("POST", "/api/auth/login", req, res);

        expect(res._statusCode).toBe(200);
        expect(res.cookie).toHaveBeenCalledWith(
          "sessionToken",
          expect.any(String),
          expect.objectContaining({ secure: true })
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
