/**
 * @fileoverview Critical path tests for Auth Flow
 *
 * Tests authentication critical paths:
 * - Session lifecycle (create, validate, delete, invalidate all)
 * - Auth middleware (cookie auth, Bearer token, dev bypass, edge cases)
 * - Account lockout (check, record, threshold, unlock)
 * - Password change flow (with session invalidation)
 * - Password reset flow (with token validation)
 * - Email verification flow
 * - Re-authentication middleware for sensitive ops
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

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
}));

// Mock database with controllable return values
const mockDbReturns = {
  selectResult: [] as any[],
  insertResult: [] as any[],
  deleteResult: [] as any[],
  updateResult: [] as any[],
};

vi.mock("../db", () => ({
  db: null,
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
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
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.deleteResult)),
      }),
    }),
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  isDatabaseAvailable: () => false,
}));

vi.mock("../security", () => ({
  SECURITY_CONFIG: {
    SESSION_TTL: 7 * 24 * 60 * 60 * 1000,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000,
  },
}));

vi.mock("../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Invalid token")),
      getUser: vi.fn().mockResolvedValue({ customClaims: {} }),
    }),
  },
}));

vi.mock("../auth/audit", () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
    logLoginSuccess: vi.fn().mockResolvedValue(undefined),
    logLoginFailure: vi.fn().mockResolvedValue(undefined),
    logLogout: vi.fn().mockResolvedValue(undefined),
    logAccountLocked: vi.fn().mockResolvedValue(undefined),
    logPasswordChanged: vi.fn().mockResolvedValue(undefined),
    logPasswordResetRequested: vi.fn().mockResolvedValue(undefined),
    logMfaEvent: vi.fn().mockResolvedValue(undefined),
    logSuspiciousActivity: vi.fn().mockResolvedValue(undefined),
    logSessionsInvalidated: vi.fn().mockResolvedValue(undefined),
  },
  AUDIT_EVENTS: {
    LOGIN_SUCCESS: "AUTH_LOGIN_SUCCESS",
    LOGIN_FAILURE: "AUTH_LOGIN_FAILURE",
    LOGOUT: "AUTH_LOGOUT",
    EMAIL_VERIFIED: "EMAIL_VERIFIED",
    EMAIL_VERIFICATION_SENT: "EMAIL_VERIFICATION_SENT",
    ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
    PASSWORD_CHANGED: "PASSWORD_CHANGED",
    PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  },
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const { AuthService } = await import("../auth/service");
const {
  authenticateUser,
  requireEmailVerification,
  requireRecentAuth,
  recordRecentAuth,
  clearRecentAuth,
  optionalAuthentication,
} = await import("../auth/middleware");

// ============================================================================
// Helpers
// ============================================================================

function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    cookies: {},
    currentUser: undefined,
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  };
}

function mockResponse(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

function mockNext(): any {
  return vi.fn();
}

// ============================================================================
// Tests
// ============================================================================

describe("Auth Flow - Critical Paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.insertResult = [];
    mockDbReturns.deleteResult = [];
    mockDbReturns.updateResult = [];
  });

  // ==========================================================================
  // AuthService - JWT & Session
  // ==========================================================================

  describe("AuthService - session lifecycle", () => {
    it("generateJWT creates a token with userId and unique jti", () => {
      const token1 = AuthService.generateJWT("user-1");
      const token2 = AuthService.generateJWT("user-1");

      expect(token1).toBeDefined();
      expect(typeof token1).toBe("string");
      // Each token should be unique due to jti
      expect(token1).not.toBe(token2);
    });

    it("verifyJWT decodes a valid token", () => {
      const token = AuthService.generateJWT("user-123");
      const result = AuthService.verifyJWT(token);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe("user-123");
    });

    it("verifyJWT returns null for invalid token", () => {
      expect(AuthService.verifyJWT("garbage-token")).toBeNull();
    });

    it("verifyJWT returns null for empty token", () => {
      expect(AuthService.verifyJWT("")).toBeNull();
    });

    it("verifyJWT returns null for tampered token", () => {
      const token = AuthService.generateJWT("user-1");
      const tampered = token.slice(0, -5) + "XXXXX";
      expect(AuthService.verifyJWT(tampered)).toBeNull();
    });

    it("createSession generates token and stores session", async () => {
      const mockSession = {
        id: "session-1",
        userId: "user-1",
        token: "jwt-token",
        expiresAt: new Date(),
      };
      mockDbReturns.insertResult = [mockSession];

      const result = await AuthService.createSession("user-1");
      expect(result.token).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.session.userId).toBe("user-1");
    });

    it("validateSession returns null for invalid JWT", async () => {
      const result = await AuthService.validateSession("invalid-jwt");
      expect(result).toBeNull();
    });

    it("validateSession returns null when session not in DB", async () => {
      // Generate a valid JWT but don't put session in DB
      const token = AuthService.generateJWT("user-1");
      mockDbReturns.selectResult = []; // No session found

      const result = await AuthService.validateSession(token);
      expect(result).toBeNull();
    });

    it("deleteSession completes for valid token", async () => {
      mockDbReturns.deleteResult = [{ id: "session-1" }];
      const result = await AuthService.deleteSession("some-token");
      expect(result).toBeUndefined();
    });

    it("deleteAllUserSessions returns count of deleted sessions", async () => {
      mockDbReturns.deleteResult = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];

      const count = await AuthService.deleteAllUserSessions("user-1");
      expect(count).toBe(3);
    });
  });

  // ==========================================================================
  // AuthService - Password & User Management
  // ==========================================================================

  describe("AuthService - password operations", () => {
    it("hashPassword produces bcrypt hash", async () => {
      const hash = await AuthService.hashPassword("MyPassword123");
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it("verifyPassword matches correct password", async () => {
      const hash = await AuthService.hashPassword("MyPassword123");
      const result = await AuthService.verifyPassword("MyPassword123", hash);
      expect(result).toBe(true);
    });

    it("verifyPassword rejects wrong password", async () => {
      const hash = await AuthService.hashPassword("MyPassword123");
      const result = await AuthService.verifyPassword("WrongPassword", hash);
      expect(result).toBe(false);
    });

    it("generateSecureToken produces 64-char hex", () => {
      const token = AuthService.generateSecureToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("generateSecureToken produces unique tokens", () => {
      const tokens = new Set(Array.from({ length: 20 }, () => AuthService.generateSecureToken()));
      expect(tokens.size).toBe(20);
    });

    it("changePassword returns failure when user not found", async () => {
      mockDbReturns.selectResult = []; // No user found

      const result = await AuthService.changePassword("nonexistent", "old", "new");
      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("changePassword verifies current password for non-Firebase users", async () => {
      const hash = await AuthService.hashPassword("CurrentPass123");
      mockDbReturns.selectResult = [
        {
          id: "user-1",
          passwordHash: hash,
          email: "test@test.com",
        },
      ];
      mockDbReturns.deleteResult = [];

      const result = await AuthService.changePassword("user-1", "WrongPass", "NewPass123");
      expect(result.success).toBe(false);
      expect(result.message).toContain("incorrect");
    });

    it("changePassword skips verification for Firebase users", async () => {
      mockDbReturns.selectResult = [
        {
          id: "user-1",
          passwordHash: "firebase-auth-user",
          email: "test@test.com",
        },
      ];
      mockDbReturns.deleteResult = [];

      const result = await AuthService.changePassword("user-1", "", "NewPass123");
      expect(result.success).toBe(true);
    });

    it("generatePasswordResetToken returns null for unverified user", async () => {
      mockDbReturns.selectResult = [{ id: "user-1", isEmailVerified: false }];

      const token = await AuthService.generatePasswordResetToken("unverified@test.com");
      expect(token).toBeNull();
    });

    it("generatePasswordResetToken returns null for nonexistent user", async () => {
      mockDbReturns.selectResult = [];

      const token = await AuthService.generatePasswordResetToken("nobody@test.com");
      expect(token).toBeNull();
    });

    it("verifyEmail returns null for invalid token", async () => {
      mockDbReturns.selectResult = [];

      const user = await AuthService.verifyEmail("invalid-token");
      expect(user).toBeNull();
    });
  });

  // ==========================================================================
  // Auth Middleware
  // ==========================================================================

  describe("authenticateUser middleware", () => {
    it("returns 401 with no auth credentials", async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("uses generic error message (no info leakage)", async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Authentication failed" })
      );
    });

    it("allows dev-admin bypass in non-production", async () => {
      const req = mockRequest({
        headers: { "x-dev-admin": "true" },
      });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.currentUser).toBeDefined();
      expect(req.currentUser.id).toBe("dev-admin-000");
    });

    it("rejects invalid session cookie", async () => {
      const req = mockRequest({
        cookies: { sessionToken: "invalid-jwt-token" },
      });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      // Should fall through to Bearer check, then fail
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("rejects Bearer token with invalid Firebase token", async () => {
      const req = mockRequest({
        headers: { authorization: "Bearer invalid-firebase-token" },
      });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects malformed Authorization header", async () => {
      const req = mockRequest({
        headers: { authorization: "NotBearer xyz" },
      });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ==========================================================================
  // Email Verification Middleware
  // ==========================================================================

  describe("requireEmailVerification middleware", () => {
    it("returns 401 if no user attached", () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      requireEmailVerification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 if email not verified", () => {
      const req = mockRequest({
        currentUser: { id: "user-1", isEmailVerified: false },
      });
      const res = mockResponse();
      const next = mockNext();

      requireEmailVerification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "EMAIL_NOT_VERIFIED" })
      );
    });

    it("calls next() when email is verified", () => {
      const req = mockRequest({
        currentUser: { id: "user-1", isEmailVerified: true },
      });
      const res = mockResponse();
      const next = mockNext();

      requireEmailVerification(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Re-authentication Middleware
  // ==========================================================================

  describe("requireRecentAuth middleware", () => {
    it("returns 401 if no user attached", () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      requireRecentAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("returns 403 REAUTH_REQUIRED if no recent auth", () => {
      const req = mockRequest({
        currentUser: { id: "user-no-reauth" },
      });
      const res = mockResponse();
      const next = mockNext();

      requireRecentAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "REAUTH_REQUIRED" }));
    });

    it("calls next() after recent auth is recorded", () => {
      const userId = "user-recent-auth";
      recordRecentAuth(userId);

      const req = mockRequest({
        currentUser: { id: userId },
      });
      const res = mockResponse();
      const next = mockNext();

      requireRecentAuth(req, res, next);

      expect(next).toHaveBeenCalled();

      // Cleanup
      clearRecentAuth(userId);
    });

    it("rejects after clearing recent auth", () => {
      const userId = "user-cleared";
      recordRecentAuth(userId);
      clearRecentAuth(userId);

      const req = mockRequest({
        currentUser: { id: userId },
      });
      const res = mockResponse();
      const next = mockNext();

      requireRecentAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ==========================================================================
  // Optional Authentication Middleware
  // ==========================================================================

  describe("optionalAuthentication middleware", () => {
    it("calls next() even with no auth", async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await optionalAuthentication(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.currentUser).toBeUndefined();
    });

    it("calls next() with invalid Bearer token (does not fail)", async () => {
      const req = mockRequest({
        headers: { authorization: "Bearer invalid-token" },
      });
      const res = mockResponse();
      const next = mockNext();

      await optionalAuthentication(req, res, next);

      expect(next).toHaveBeenCalled();
      // User should not be set for invalid token
      expect(req.currentUser).toBeUndefined();
    });
  });

  // ==========================================================================
  // Lockout Service
  // ==========================================================================

  describe("LockoutService", () => {
    // Import separately since it depends on security config
    let LockoutService: any;

    beforeEach(async () => {
      const mod = await import("../auth/lockout");
      LockoutService = mod.LockoutService;
    });

    it("getLockoutMessage returns correct message when unlocked", () => {
      const pastDate = new Date(Date.now() - 1000);
      const msg = LockoutService.getLockoutMessage(pastDate);
      expect(msg).toContain("now unlocked");
    });

    it("getLockoutMessage returns minutes message for short lockout", () => {
      const future = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      const msg = LockoutService.getLockoutMessage(future);
      expect(msg).toContain("minutes");
    });

    it("getLockoutMessage returns hours message for long lockout", () => {
      const future = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      const msg = LockoutService.getLockoutMessage(future);
      expect(msg).toContain("hour");
    });

    it("getLockoutMessage handles <1 minute remaining", () => {
      const future = new Date(Date.now() + 30 * 1000); // 30 seconds
      const msg = LockoutService.getLockoutMessage(future);
      expect(msg).toContain("less than a minute");
    });

    it("checkLockout returns unlocked status when no lockout exists", async () => {
      mockDbReturns.selectResult = [];

      const status = await LockoutService.checkLockout("test@test.com");
      expect(status.isLocked).toBe(false);
    });

    it("recordAttempt clears lockout on successful login", async () => {
      mockDbReturns.selectResult = [];
      mockDbReturns.deleteResult = [];

      const status = await LockoutService.recordAttempt("test@test.com", "127.0.0.1", true);
      expect(status.isLocked).toBe(false);
      expect(status.failedAttempts).toBe(0);
    });
  });

  // ==========================================================================
  // User creation edge cases
  // ==========================================================================

  describe("AuthService - user creation", () => {
    it("creates a user with hashed password", async () => {
      const mockUser = {
        id: "new-user-1",
        email: "new@test.com",
        firstName: "Test",
        lastName: "User",
        isEmailVerified: false,
      };
      mockDbReturns.insertResult = [mockUser];

      const { user, emailToken } = await AuthService.createUser({
        email: "New@Test.com  ",
        password: "SecurePass123!",
        firstName: "  Test  ",
        lastName: "User",
      });

      expect(user.id).toBe("new-user-1");
      expect(emailToken).toBeDefined();
      expect(emailToken).toHaveLength(64);
    });

    it("Firebase users get auto-verified and placeholder password", async () => {
      const mockUser = {
        id: "fb-user-1",
        email: "fb@test.com",
        isEmailVerified: true,
        firebaseUid: "fb-uid-123",
      };
      mockDbReturns.insertResult = [mockUser];

      const { user } = await AuthService.createUser({
        email: "fb@test.com",
        password: "ignored",
        firstName: "Firebase",
        lastName: "User",
        firebaseUid: "fb-uid-123",
      });

      expect(user.isEmailVerified).toBe(true);
    });
  });
});
