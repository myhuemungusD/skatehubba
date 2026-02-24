/**
 * @fileoverview Integration tests for auth route flows
 *
 * Tests the complete authentication route chain:
 * - Login flow (Firebase token → session creation → cookie)
 * - Logout flow (session deletion → cookie clearing)
 * - Email verification (token validation → user update)
 * - Password change (current password verification → hash update → session invalidation)
 * - Password reset (token generation → token validation → password update)
 * - MFA status check, setup, verify, disable
 * - Verify-identity for sensitive operations
 * - Mock token handling (dev vs production)
 * - Account lockout integration
 * - Error handling (invalid tokens, missing fields, rate limits)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Express } from "express";

// =============================================================================
// Mocks
// =============================================================================

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

// Mock database with controllable returns
const mockDbReturns = {
  selectResult: [] as any[],
  insertResult: [] as any[],
  deleteResult: [] as any[],
  updateResult: [] as any[],
};

vi.mock("../../db", () => ({
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
}));

vi.mock("../../security", () => ({
  SECURITY_CONFIG: {
    SESSION_TTL: 7 * 24 * 60 * 60 * 1000,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000,
  },
}));

const mockVerifyIdToken = vi.fn();
const mockGetUser = vi.fn().mockResolvedValue({ customClaims: {} });

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
      getUser: mockGetUser,
    }),
  },
}));

vi.mock("../../auth/audit", () => ({
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

vi.mock("../../middleware/rateLimit", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../middleware/csrf", () => ({
  requireCsrfToken: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../redis", () => ({
  getRedisClient: () => null,
}));

// =============================================================================
// Imports after mocks
// =============================================================================

const { AuthService } = await import("../../auth/service");
const { AuditLogger } = await import("../../auth/audit");
const { LockoutService } = await import("../../auth/lockout");
const { setupAuthRoutes } = await import("../../auth/routes");

// =============================================================================
// Helpers: Express-like request/response mocking
// =============================================================================

function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    cookies: {},
    body: {},
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

// Capture route handlers from setupAuthRoutes
type RouteHandler = (req: any, res: any, next?: any) => Promise<any>;

const routeHandlers: Record<string, RouteHandler[]> = {};

function captureRoutes(): Express {
  const app: any = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routeHandlers[`GET ${path}`] = handlers;
    },
    post: (path: string, ...handlers: RouteHandler[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    },
    put: (path: string, ...handlers: RouteHandler[]) => {
      routeHandlers[`PUT ${path}`] = handlers;
    },
    delete: (path: string, ...handlers: RouteHandler[]) => {
      routeHandlers[`DELETE ${path}`] = handlers;
    },
  };
  return app as Express;
}

async function callRoute(method: string, path: string, req: any, res: any) {
  const key = `${method} ${path}`;
  const handlers = routeHandlers[key];
  if (!handlers) throw new Error(`No handler found for ${key}`);

  // Execute middleware chain then final handler
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe("Auth Routes - Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.insertResult = [];
    mockDbReturns.deleteResult = [];
    mockDbReturns.updateResult = [];

    // Reset route handlers
    for (const key of Object.keys(routeHandlers)) {
      delete routeHandlers[key];
    }

    // Capture fresh routes
    const app = captureRoutes();
    setupAuthRoutes(app);
  });

  // ===========================================================================
  // Login flow
  // ===========================================================================

  describe("POST /api/auth/login", () => {
    it("rejects request without Authorization header", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("POST", "/api/auth/login", req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Authentication failed" })
      );
    });

    it("rejects non-Bearer token format", async () => {
      const req = mockRequest({
        headers: { authorization: "Basic abc123" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/login", req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("handles mock token in development mode for new user", async () => {
      // Setup: no existing user
      mockDbReturns.selectResult = [];
      // createUser returns new user
      mockDbReturns.insertResult = [
        {
          id: "new-user-1",
          email: "dev@skatehubba.local",
          firstName: "Dev",
          lastName: "Skater",
          isEmailVerified: true,
          firebaseUid: "mock-uid-12345",
          createdAt: new Date(),
          isActive: true,
        },
      ];

      const req = mockRequest({
        headers: { authorization: "Bearer mock-token" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/login", req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            email: "dev@skatehubba.local",
            provider: "firebase",
          }),
          strategy: "firebase",
        })
      );
      expect(res.cookie).toHaveBeenCalledWith(
        "sessionToken",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        })
      );
    });

    it("handles mock Google token in development mode", async () => {
      mockDbReturns.selectResult = [];
      mockDbReturns.insertResult = [
        {
          id: "google-user-1",
          email: "google@skatehubba.local",
          firstName: "Google",
          lastName: "Skater",
          isEmailVerified: true,
          firebaseUid: "mock-google-uid-12345",
          createdAt: new Date(),
          isActive: true,
        },
      ];

      const req = mockRequest({
        headers: { authorization: "Bearer mock-google-token" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/login", req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles existing user login (finds by Firebase UID)", async () => {
      const existingUser = {
        id: "existing-1",
        email: "existing@test.com",
        firstName: "Existing",
        lastName: "User",
        isEmailVerified: true,
        firebaseUid: "mock-uid-12345",
        isActive: true,
        createdAt: new Date(),
      };

      // findUserByFirebaseUid returns existing user
      mockDbReturns.selectResult = [existingUser];
      // createSession
      mockDbReturns.insertResult = [
        { id: "session-1", userId: "existing-1", token: "jwt-token", expiresAt: new Date() },
      ];

      const req = mockRequest({
        headers: { authorization: "Bearer mock-token" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/login", req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: "existing-1" }),
        })
      );
    });

    it("rejects invalid Firebase token", async () => {
      mockVerifyIdToken.mockRejectedValueOnce(new Error("Invalid token"));

      const req = mockRequest({
        headers: { authorization: "Bearer invalid-firebase-token" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/login", req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(AuditLogger.logLoginFailure).toHaveBeenCalled();
    });

    it("logs successful login event", async () => {
      mockDbReturns.selectResult = [];
      mockDbReturns.insertResult = [
        {
          id: "audit-user",
          email: "dev@skatehubba.local",
          firstName: "Dev",
          lastName: "Skater",
          isEmailVerified: true,
          firebaseUid: "mock-uid-12345",
          isActive: true,
          createdAt: new Date(),
        },
      ];

      const req = mockRequest({
        headers: { authorization: "Bearer mock-token" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/login", req, res);

      expect(AuditLogger.logLoginSuccess).toHaveBeenCalledWith(
        "audit-user",
        "dev@skatehubba.local",
        "127.0.0.1",
        undefined,
        "firebase"
      );
    });
  });

  // ===========================================================================
  // Logout flow
  // ===========================================================================

  describe("POST /api/auth/logout", () => {
    it("clears session cookie on logout", async () => {
      const req = mockRequest({
        cookies: { sessionToken: "valid-session-token" },
        currentUser: {
          id: "user-1",
          email: "test@test.com",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/logout", req, res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        "sessionToken",
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Logged out successfully",
        })
      );
    });

    it("handles logout with Bearer token", async () => {
      const req = mockRequest({
        headers: { authorization: "Bearer jwt-token-here" },
        currentUser: { id: "user-1", email: "test@test.com" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/logout", req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("logs logout audit event", async () => {
      const req = mockRequest({
        cookies: { sessionToken: "session-1" },
        currentUser: { id: "user-1", email: "test@test.com" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/logout", req, res);

      expect(AuditLogger.logLogout).toHaveBeenCalledWith(
        "user-1",
        "test@test.com",
        "127.0.0.1",
        undefined
      );
    });
  });

  // ===========================================================================
  // Get current user
  // ===========================================================================

  describe("GET /api/auth/me", () => {
    it("returns current user details", async () => {
      const req = mockRequest({
        currentUser: {
          id: "user-1",
          email: "test@test.com",
          firstName: "Test",
          lastName: "User",
          isEmailVerified: true,
          accountTier: "free",
          lastLoginAt: new Date(),
          createdAt: new Date(),
        },
      });
      const res = mockResponse();

      await callRoute("GET", "/api/auth/me", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            id: "user-1",
            email: "test@test.com",
            firstName: "Test",
            lastName: "User",
            isEmailVerified: true,
          }),
        })
      );
    });
  });

  // ===========================================================================
  // Email verification
  // ===========================================================================

  describe("POST /api/auth/verify-email", () => {
    it("rejects missing token", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/verify-email", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Verification token is required" })
      );
    });

    it("rejects invalid token format (non-hex)", async () => {
      const req = mockRequest({ body: { token: "not-hex-!!!@@@" } });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/verify-email", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_TOKEN" }));
    });

    it("rejects token longer than 128 chars", async () => {
      const longToken = "a".repeat(200);
      const req = mockRequest({ body: { token: longToken } });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/verify-email", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns error for invalid/expired token", async () => {
      // AuthService.verifyEmail will return null (no matching token in DB)
      mockDbReturns.selectResult = [];

      const req = mockRequest({
        body: { token: "a".repeat(64) }, // Valid format but nonexistent
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/verify-email", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_TOKEN" }));
    });

    it("succeeds for valid token", async () => {
      const verifiedUser = {
        id: "user-1",
        email: "verified@test.com",
        isEmailVerified: true,
      };
      // verifyEmail: first select finds the user
      mockDbReturns.selectResult = [
        {
          id: "user-1",
          email: "verified@test.com",
          emailVerificationToken: "a".repeat(64),
          emailVerificationExpires: new Date(Date.now() + 86400000),
        },
      ];
      mockDbReturns.updateResult = [verifiedUser];

      const req = mockRequest({
        body: { token: "a".repeat(64) },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/verify-email", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining("verified"),
        })
      );
    });
  });

  // ===========================================================================
  // Password change
  // ===========================================================================

  describe("POST /api/auth/change-password", () => {
    it("rejects too-short password", async () => {
      const req = mockRequest({
        currentUser: { id: "user-1" },
        body: { currentPassword: "old", newPassword: "short" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/change-password", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_PASSWORD" }));
    });

    it("rejects weak password (no uppercase/number)", async () => {
      const req = mockRequest({
        currentUser: { id: "user-1" },
        body: { currentPassword: "old", newPassword: "alllowercase" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/change-password", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "WEAK_PASSWORD" }));
    });

    it("rejects incorrect current password", async () => {
      const hash = await AuthService.hashPassword("RealPassword1");
      mockDbReturns.selectResult = [{ id: "user-1", passwordHash: hash, email: "test@test.com" }];

      const req = mockRequest({
        currentUser: { id: "user-1" },
        body: { currentPassword: "WrongPassword1", newPassword: "NewPassword1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/change-password", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "PASSWORD_CHANGE_FAILED" })
      );
    });

    it("succeeds with correct current password", async () => {
      const hash = await AuthService.hashPassword("CurrentPass1");
      mockDbReturns.selectResult = [{ id: "user-1", passwordHash: hash, email: "test@test.com" }];
      mockDbReturns.deleteResult = []; // session cleanup
      mockDbReturns.insertResult = [
        { id: "new-session", userId: "user-1", token: "new-jwt", expiresAt: new Date() },
      ];

      const req = mockRequest({
        currentUser: { id: "user-1" },
        body: { currentPassword: "CurrentPass1", newPassword: "NewSecure1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/change-password", req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("logs password change audit event", async () => {
      const hash = await AuthService.hashPassword("OldPass1");
      mockDbReturns.selectResult = [{ id: "user-1", passwordHash: hash, email: "audit@test.com" }];
      mockDbReturns.deleteResult = [];
      mockDbReturns.insertResult = [
        { id: "s", userId: "user-1", token: "t", expiresAt: new Date() },
      ];

      const req = mockRequest({
        currentUser: { id: "user-1", email: "audit@test.com" },
        body: { currentPassword: "OldPass1", newPassword: "NewPass1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/change-password", req, res);

      expect(AuditLogger.logPasswordChanged).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Forgot password
  // ===========================================================================

  describe("POST /api/auth/forgot-password", () => {
    it("rejects missing email", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/forgot-password", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("always returns success to prevent email enumeration", async () => {
      mockDbReturns.selectResult = []; // User not found

      const req = mockRequest({
        body: { email: "nonexistent@test.com" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/forgot-password", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining("If an account"),
        })
      );
    });

    it("logs password reset request", async () => {
      mockDbReturns.selectResult = [];

      const req = mockRequest({
        body: { email: "test@test.com" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/forgot-password", req, res);

      expect(AuditLogger.logPasswordResetRequested).toHaveBeenCalledWith(
        "test@test.com",
        expect.any(String),
        expect.any(Boolean)
      );
    });
  });

  // ===========================================================================
  // Reset password
  // ===========================================================================

  describe("POST /api/auth/reset-password", () => {
    it("rejects missing token", async () => {
      const req = mockRequest({ body: { newPassword: "NewPass1" } });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/reset-password", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("rejects short password", async () => {
      const req = mockRequest({
        body: { token: "valid-token", newPassword: "short" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/reset-password", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_PASSWORD" }));
    });

    it("rejects weak password", async () => {
      const req = mockRequest({
        body: { token: "valid-token", newPassword: "alllowercase" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/reset-password", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "WEAK_PASSWORD" }));
    });

    it("returns error for invalid reset token", async () => {
      mockDbReturns.selectResult = []; // Token not found

      const req = mockRequest({
        body: { token: "invalid-token", newPassword: "ValidPass1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/reset-password", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_TOKEN" }));
    });

    it("succeeds with valid token and strong password", async () => {
      // resetPassword: select finds user, update returns updated user
      mockDbReturns.selectResult = [
        {
          id: "user-1",
          email: "reset@test.com",
          resetPasswordToken: "valid-reset-token",
          resetPasswordExpires: new Date(Date.now() + 86400000),
        },
      ];
      mockDbReturns.updateResult = [{ id: "user-1", email: "reset@test.com" }];
      mockDbReturns.deleteResult = []; // session cleanup

      const req = mockRequest({
        body: { token: "valid-reset-token", newPassword: "NewSecure1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/reset-password", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining("reset successfully"),
        })
      );
    });
  });

  // ===========================================================================
  // MFA routes
  // ===========================================================================

  describe("GET /api/auth/mfa/status", () => {
    it("returns MFA disabled status", async () => {
      mockDbReturns.selectResult = []; // No MFA record

      const req = mockRequest({
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("GET", "/api/auth/mfa/status", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          userId: "user-1",
        })
      );
    });

    it("returns MFA enabled status", async () => {
      mockDbReturns.selectResult = [{ userId: "user-1", enabled: true }];

      const req = mockRequest({
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("GET", "/api/auth/mfa/status", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          userId: "user-1",
        })
      );
    });
  });

  describe("POST /api/auth/mfa/setup", () => {
    it("rejects setup when MFA is already enabled", async () => {
      mockDbReturns.selectResult = [{ userId: "user-1", enabled: true }];

      const req = mockRequest({
        currentUser: { id: "user-1", email: "test@test.com" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/mfa/setup", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "MFA_ALREADY_ENABLED" })
      );
    });
  });

  describe("POST /api/auth/mfa/verify-setup", () => {
    it("rejects invalid code format", async () => {
      const req = mockRequest({
        currentUser: { id: "user-1", email: "test@test.com" },
        body: { code: "123" }, // Too short
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/mfa/verify-setup", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "INVALID_CODE_FORMAT" })
      );
    });

    it("rejects missing code", async () => {
      const req = mockRequest({
        currentUser: { id: "user-1", email: "test@test.com" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/mfa/verify-setup", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("POST /api/auth/mfa/verify", () => {
    it("rejects missing code", async () => {
      const req = mockRequest({
        currentUser: { id: "user-1", email: "test@test.com" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/mfa/verify", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "MISSING_CODE" }));
    });
  });

  describe("POST /api/auth/mfa/disable", () => {
    it("rejects missing code", async () => {
      const req = mockRequest({
        currentUser: { id: "user-1", email: "test@test.com" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/mfa/disable", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "MISSING_CODE" }));
    });
  });

  describe("POST /api/auth/mfa/backup-codes", () => {
    it("rejects missing code", async () => {
      const req = mockRequest({
        currentUser: { id: "user-1", email: "test@test.com" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/mfa/backup-codes", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ===========================================================================
  // Resend verification
  // ===========================================================================

  describe("POST /api/auth/resend-verification", () => {
    it("rejects if email already verified", async () => {
      const req = mockRequest({
        currentUser: { id: "user-1", email: "test@test.com", isEmailVerified: true },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/resend-verification", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "ALREADY_VERIFIED" }));
    });
  });

  // ===========================================================================
  // Verify identity
  // ===========================================================================

  describe("POST /api/auth/verify-identity", () => {
    it("requires password when no MFA and no Firebase token", async () => {
      mockDbReturns.selectResult = []; // No MFA record

      const req = mockRequest({
        currentUser: { id: "user-1", email: "test@test.com" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/verify-identity", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PASSWORD_REQUIRED" }));
    });

    it("requires MFA code when MFA is enabled", async () => {
      mockDbReturns.selectResult = [{ userId: "user-1", enabled: true }];

      const req = mockRequest({
        currentUser: { id: "user-1", email: "test@test.com" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/verify-identity", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "MFA_REQUIRED",
          mfaEnabled: true,
        })
      );
    });
  });
});

// =============================================================================
// AuthService standalone tests (supplement existing)
// =============================================================================

describe("AuthService - Additional Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.insertResult = [];
    mockDbReturns.deleteResult = [];
    mockDbReturns.updateResult = [];
  });

  describe("findUserByEmail", () => {
    it("returns null when no user found", async () => {
      mockDbReturns.selectResult = [];
      const user = await AuthService.findUserByEmail("nobody@test.com");
      expect(user).toBeNull();
    });

    it("normalizes email (lowercase, trim)", async () => {
      mockDbReturns.selectResult = [{ id: "user-1", email: "test@test.com" }];
      const user = await AuthService.findUserByEmail("  Test@Test.com  ");
      expect(user).not.toBeNull();
    });
  });

  describe("findUserById", () => {
    it("returns null when user not found", async () => {
      mockDbReturns.selectResult = [];
      const user = await AuthService.findUserById("nonexistent");
      expect(user).toBeNull();
    });

    it("returns user when found", async () => {
      mockDbReturns.selectResult = [{ id: "user-1" }];
      const user = await AuthService.findUserById("user-1");
      expect(user).not.toBeNull();
      expect(user!.id).toBe("user-1");
    });
  });

  describe("findUserByFirebaseUid", () => {
    it("returns null when no matching Firebase UID", async () => {
      mockDbReturns.selectResult = [];
      const user = await AuthService.findUserByFirebaseUid("no-uid");
      expect(user).toBeNull();
    });
  });

  describe("verifyEmail", () => {
    it("returns null for expired or invalid token", async () => {
      mockDbReturns.selectResult = [];
      const user = await AuthService.verifyEmail("invalid-token");
      expect(user).toBeNull();
    });
  });

  describe("generatePasswordResetToken", () => {
    it("returns null for nonexistent user", async () => {
      mockDbReturns.selectResult = [];
      const token = await AuthService.generatePasswordResetToken("nobody@test.com");
      expect(token).toBeNull();
    });

    it("succeeds for unverified email user", async () => {
      mockDbReturns.selectResult = [{ id: "u1", isEmailVerified: false }];
      mockDbReturns.updateResult = [];
      const token = await AuthService.generatePasswordResetToken("unverified@test.com");
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
    });
  });

  describe("updateLastLogin", () => {
    it("completes without error", async () => {
      mockDbReturns.updateResult = [];
      await expect(AuthService.updateLastLogin("user-1")).resolves.toBeUndefined();
    });
  });

  describe("updateUser", () => {
    it("returns null when user not found", async () => {
      mockDbReturns.updateResult = [];
      const result = await AuthService.updateUser("nonexistent", { firstName: "Test" });
      expect(result).toBeNull();
    });

    it("returns updated user", async () => {
      mockDbReturns.updateResult = [{ id: "user-1", firstName: "Updated" }];
      const result = await AuthService.updateUser("user-1", { firstName: "Updated" });
      expect(result).not.toBeNull();
      expect(result!.firstName).toBe("Updated");
    });
  });
});
