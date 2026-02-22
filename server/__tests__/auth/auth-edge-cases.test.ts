/**
 * @fileoverview Additional auth coverage tests
 *
 * Targets specific uncovered lines in:
 * - server/auth/email.ts (lines 110, 121, 138) - production URL + Resend sends
 * - server/auth/routes/emailVerification.ts (lines 94-128) - resend-verification full flow
 * - server/auth/routes/login.ts (lines 178-179, 219-220) - catch blocks
 * - server/auth/routes/password.ts (lines 105-106, 157-158) - catch blocks
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Express } from "express";

// =============================================================================
// Mocks (must be defined before any imports that use them)
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
  isDatabaseAvailable: () => false,
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

// Mock services called by emailVerification routes
vi.mock("../../services/emailService", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/notificationService", () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
}));

// Mock the auth email module for route tests (we test the real module separately below)
const mockSendVerificationEmail = vi.fn().mockResolvedValue(undefined);
const mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../../auth/email", () => ({
  sendVerificationEmail: (...args: any[]) => mockSendVerificationEmail(...args),
  sendPasswordResetEmail: (...args: any[]) => mockSendPasswordResetEmail(...args),
}));

// =============================================================================
// Imports after mocks
// =============================================================================

const { AuthService } = await import("../../auth/service");
const { AuditLogger } = await import("../../auth/audit");
const { setupAuthRoutes } = await import("../../auth/routes");
const logger = (await import("../../logger")).default;

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

  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe("Auth Coverage - Route Error Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.insertResult = [];
    mockDbReturns.deleteResult = [];
    mockDbReturns.updateResult = [];

    for (const key of Object.keys(routeHandlers)) {
      delete routeHandlers[key];
    }

    const app = captureRoutes();
    setupAuthRoutes(app);
  });

  // ===========================================================================
  // GET /api/auth/me catch block (login.ts lines 178-179)
  // ===========================================================================

  describe("GET /api/auth/me - error handling", () => {
    it("returns 500 when an unexpected error occurs in the handler", async () => {
      // Provide a currentUser that will cause a throw when properties are accessed
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

      const req = mockRequest({
        currentUser: badUser,
      });
      const res = mockResponse();

      await callRoute("GET", "/api/auth/me", req, res);

      expect(logger.error).toHaveBeenCalledWith(
        "Get user error",
        expect.objectContaining({
          error: expect.stringContaining("Simulated user object error"),
        })
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to get user information" })
      );
    });
  });

  // ===========================================================================
  // POST /api/auth/logout catch block (login.ts lines 219-220)
  // ===========================================================================

  describe("POST /api/auth/logout - error handling", () => {
    it("returns 500 when session deletion throws", async () => {
      // Mock AuthService.deleteSession to throw
      const originalDeleteSession = AuthService.deleteSession;
      AuthService.deleteSession = vi.fn().mockRejectedValue(new Error("DB connection lost"));

      const req = mockRequest({
        cookies: { sessionToken: "some-session-token" },
        currentUser: { id: "user-1", email: "test@test.com" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/logout", req, res);

      expect(logger.error).toHaveBeenCalledWith(
        "Logout error",
        expect.objectContaining({
          error: expect.stringContaining("DB connection lost"),
        })
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Logout failed" }));

      // Restore
      AuthService.deleteSession = originalDeleteSession;
    });
  });

  // ===========================================================================
  // POST /api/auth/forgot-password catch block (password.ts lines 105-106)
  // ===========================================================================

  describe("POST /api/auth/forgot-password - error handling", () => {
    it("returns 500 when generatePasswordResetToken throws", async () => {
      const originalGenerateToken = AuthService.generatePasswordResetToken;
      AuthService.generatePasswordResetToken = vi
        .fn()
        .mockRejectedValue(new Error("Database write failure"));

      const req = mockRequest({
        body: { email: "test@test.com" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/forgot-password", req, res);

      expect(logger.error).toHaveBeenCalledWith(
        "Forgot password error",
        expect.objectContaining({
          error: expect.stringContaining("Database write failure"),
        })
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to process request" })
      );

      AuthService.generatePasswordResetToken = originalGenerateToken;
    });
  });

  // ===========================================================================
  // POST /api/auth/reset-password catch block (password.ts lines 157-158)
  // ===========================================================================

  describe("POST /api/auth/reset-password - error handling", () => {
    it("returns 500 when resetPassword throws", async () => {
      const originalResetPassword = AuthService.resetPassword;
      AuthService.resetPassword = vi.fn().mockRejectedValue(new Error("Hash computation failed"));

      const req = mockRequest({
        body: { token: "valid-token", newPassword: "ValidPass1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/reset-password", req, res);

      expect(logger.error).toHaveBeenCalledWith(
        "Reset password error",
        expect.objectContaining({
          error: expect.stringContaining("Hash computation failed"),
        })
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Password reset failed" })
      );

      AuthService.resetPassword = originalResetPassword;
    });
  });

  // ===========================================================================
  // POST /api/auth/resend-verification full flow (emailVerification.ts lines 94-128)
  // ===========================================================================

  describe("POST /api/auth/resend-verification - full flow", () => {
    it("returns 400 ALREADY_VERIFIED when email is already verified", async () => {
      const req = mockRequest({
        currentUser: {
          id: "user-1",
          email: "verified@test.com",
          isEmailVerified: true,
          firstName: "Test",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/resend-verification", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Email is already verified",
          code: "ALREADY_VERIFIED",
        })
      );
    });

    it("generates token, sends email, logs audit, and returns success for unverified user", async () => {
      // updateUser returns the updated user
      mockDbReturns.updateResult = [{ id: "user-1", email: "unverified@test.com" }];

      const req = mockRequest({
        currentUser: {
          id: "user-1",
          email: "unverified@test.com",
          isEmailVerified: false,
          firstName: "Skater",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/resend-verification", req, res);

      // Verify sendVerificationEmail was called with correct args
      expect(mockSendVerificationEmail).toHaveBeenCalledWith(
        "unverified@test.com",
        expect.any(String), // generated token
        "Skater"
      );

      // Verify audit log was written
      expect(AuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "EMAIL_VERIFICATION_SENT",
          userId: "user-1",
          email: "unverified@test.com",
          success: true,
        })
      );

      // Verify success response
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Verification email has been sent.",
        })
      );
    });

    it("uses 'Skater' as default name when firstName is not set", async () => {
      mockDbReturns.updateResult = [{ id: "user-2", email: "noname@test.com" }];

      const req = mockRequest({
        currentUser: {
          id: "user-2",
          email: "noname@test.com",
          isEmailVerified: false,
          firstName: null,
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/resend-verification", req, res);

      expect(mockSendVerificationEmail).toHaveBeenCalledWith(
        "noname@test.com",
        expect.any(String),
        "Skater" // default fallback name
      );

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("returns 500 when an unexpected error occurs", async () => {
      // Make updateUser throw to trigger the catch block
      const originalUpdateUser = AuthService.updateUser;
      AuthService.updateUser = vi.fn().mockRejectedValue(new Error("DB timeout during resend"));

      const req = mockRequest({
        currentUser: {
          id: "user-1",
          email: "unverified@test.com",
          isEmailVerified: false,
          firstName: "Test",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/api/auth/resend-verification", req, res);

      expect(logger.error).toHaveBeenCalledWith(
        "Resend verification error",
        expect.objectContaining({
          error: expect.stringContaining("DB timeout during resend"),
        })
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to resend verification email" })
      );

      AuthService.updateUser = originalUpdateUser;
    });
  });
});

// =============================================================================
// auth/email.ts - Direct module tests for production URL and Resend sends
// =============================================================================

describe("auth/email.ts - production URL and Resend integration", () => {
  // These tests need a fresh import of auth/email.ts with different env values
  // and a mocked Resend constructor to exercise lines 110, 121, and 138.

  it("getBaseUrl returns production URL when NODE_ENV is production (line 110)", async () => {
    // We test the getBaseUrl logic indirectly through sendVerificationEmail.
    // When NODE_ENV=production and RESEND_API_KEY is set, the Resend client
    // is created and the production URL is used in the email.

    // Reset modules to re-evaluate with new env
    vi.resetModules();

    // Remove the hoisted vi.mock for ../auth/email so we import the real module
    vi.doUnmock("../../auth/email");

    // Re-mock env with production settings
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://test",
        JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
        SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
        NODE_ENV: "production",
        RESEND_API_KEY: "re_test_key_123",
        PRODUCTION_URL: "https://custom.skatehubba.com",
      },
    }));

    vi.doMock("../../logger", () => ({
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

    // Mock the Resend constructor to capture emails.send calls
    const mockEmailsSend = vi.fn().mockResolvedValue({ id: "email-123" });
    vi.doMock("resend", () => {
      return {
        Resend: class MockResend {
          emails = { send: mockEmailsSend };
        },
      };
    });

    // Import the module fresh
    const { sendVerificationEmail, sendPasswordResetEmail } = await import("../../auth/email");

    // Test sendVerificationEmail (covers lines 110, 121)
    await sendVerificationEmail("user@test.com", "abc123token", "TestUser");

    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    const verifyCall = mockEmailsSend.mock.calls[0][0];
    expect(verifyCall.from).toBe("SkateHubba <hello@skatehubba.com>");
    expect(verifyCall.to).toBe("user@test.com");
    expect(verifyCall.subject).toContain("Verify your SkateHubba account");
    // The URL should use the production URL (PRODUCTION_URL env var)
    expect(verifyCall.html).toContain(
      "https://custom.skatehubba.com/verify-email?token=abc123token"
    );

    // Test sendPasswordResetEmail (covers lines 110, 138)
    mockEmailsSend.mockClear();
    await sendPasswordResetEmail("user@test.com", "reset-token-456", "TestUser");

    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    const resetCall = mockEmailsSend.mock.calls[0][0];
    expect(resetCall.from).toBe("SkateHubba <hello@skatehubba.com>");
    expect(resetCall.to).toBe("user@test.com");
    expect(resetCall.subject).toBe("Reset your SkateHubba password");
    expect(resetCall.html).toContain(
      "https://custom.skatehubba.com/reset-password?token=reset-token-456"
    );
  });

  it("getBaseUrl falls back to https://skatehubba.com when PRODUCTION_URL is not set (line 110)", async () => {
    vi.resetModules();
    vi.doUnmock("../../auth/email");

    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://test",
        JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
        SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
        NODE_ENV: "production",
        RESEND_API_KEY: "re_test_key_456",
        // No PRODUCTION_URL set
      },
    }));

    vi.doMock("../../logger", () => ({
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

    const mockEmailsSend = vi.fn().mockResolvedValue({ id: "email-456" });
    vi.doMock("resend", () => {
      return {
        Resend: class MockResend {
          emails = { send: mockEmailsSend };
        },
      };
    });

    const { sendVerificationEmail } = await import("../../auth/email");

    await sendVerificationEmail("fallback@test.com", "tok123", "FallbackUser");

    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    const call = mockEmailsSend.mock.calls[0][0];
    // Should fall back to default production URL
    expect(call.html).toContain("https://skatehubba.com/verify-email?token=tok123");
  });
});
