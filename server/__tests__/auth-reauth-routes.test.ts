/**
 * @fileoverview Unit tests for re-authentication route handler
 *
 * Tests route handler directly by capturing Express app registration.
 *
 * POST /api/auth/verify-identity — Verify identity for sensitive operations
 *
 * Branches:
 * - MFA enabled: requires MFA code
 * - MFA disabled + Firebase token: verifies fresh token
 * - MFA disabled + password: verifies password
 * - MFA disabled + no auth method: returns 400
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

const { mockRecordRecentAuth, mockVerifyIdToken } = vi.hoisted(() => ({
  mockRecordRecentAuth: vi.fn(),
  mockVerifyIdToken: vi.fn(),
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.currentUser = { id: "user1", email: "test@example.com", firstName: "Test" };
    next();
  }),
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
  recordRecentAuth: mockRecordRecentAuth,
}));

vi.mock("../middleware/csrf", () => ({
  requireCsrfToken: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
  },
}));

vi.mock("../auth/service", () => ({
  AuthService: {
    findUserById: vi.fn(),
    verifyPassword: vi.fn(),
  },
}));

vi.mock("../auth/audit", () => ({
  AuditLogger: {
    log: vi.fn(),
  },
  getClientIP: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../auth/mfa", () => ({
  MfaService: {
    isEnabled: vi.fn(),
    verifyCode: vi.fn(),
  },
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { setupReauthRoutes } from "../auth/routes/reauth.ts";
import { MfaService } from "../auth/mfa.ts";
import { AuthService } from "../auth/service.ts";
import { AuditLogger } from "../auth/audit.ts";

// ============================================================================
// Helpers
// ============================================================================

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createMockReq(overrides: Record<string, any> = {}) {
  return {
    currentUser: { id: "user1", email: "test@example.com", firstName: "Test" },
    body: {},
    headers: { "user-agent": "test-agent" },
    ...overrides,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe("Reauth Routes", () => {
  let routes: Record<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();

    routes = {};
    const mockApp = {
      get: vi.fn((path: string, ...handlers: Function[]) => {
        routes[`GET ${path}`] = handlers[handlers.length - 1];
      }),
      post: vi.fn((path: string, ...handlers: Function[]) => {
        routes[`POST ${path}`] = handlers[handlers.length - 1];
      }),
    };

    setupReauthRoutes(mockApp as any);
  });

  // --------------------------------------------------------------------------
  // POST /api/auth/verify-identity
  // --------------------------------------------------------------------------
  describe("POST /api/auth/verify-identity", () => {
    // ========================================================================
    // MFA enabled path
    // ========================================================================
    describe("when MFA is enabled", () => {
      beforeEach(() => {
        vi.mocked(MfaService.isEnabled).mockResolvedValue(true);
      });

      it("returns 400 if MFA code is missing", async () => {
        const req = createMockReq({ body: {} });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "MFA code required for identity verification",
          code: "MFA_REQUIRED",
          mfaEnabled: true,
        });
      });

      it("returns 400 if MFA code is not a string", async () => {
        const req = createMockReq({ body: { mfaCode: 123456 } });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "MFA code required for identity verification",
          code: "MFA_REQUIRED",
          mfaEnabled: true,
        });
      });

      it("returns 401 if MFA code is invalid", async () => {
        vi.mocked(MfaService.verifyCode).mockResolvedValue(false);
        const req = createMockReq({ body: { mfaCode: "999999" } });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(MfaService.verifyCode).toHaveBeenCalledWith(
          "user1",
          "test@example.com",
          "999999",
          "127.0.0.1",
          "test-agent"
        );
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: "Invalid MFA code",
          code: "INVALID_MFA",
        });
      });

      it("returns 200 and records auth on valid MFA code", async () => {
        vi.mocked(MfaService.verifyCode).mockResolvedValue(true);
        const req = createMockReq({ body: { mfaCode: "123456" } });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(MfaService.verifyCode).toHaveBeenCalledWith(
          "user1",
          "test@example.com",
          "123456",
          "127.0.0.1",
          "test-agent"
        );
        expect(mockRecordRecentAuth).toHaveBeenCalledWith("user1");
        expect(AuditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: "AUTH_REAUTH_SUCCESS",
            userId: "user1",
            email: "test@example.com",
            ipAddress: "127.0.0.1",
            userAgent: "test-agent",
            success: true,
          })
        );
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          message: "Identity verified. You can proceed with sensitive operations.",
          expiresIn: 300,
        });
      });
    });

    // ========================================================================
    // MFA disabled — Firebase token path
    // ========================================================================
    describe("when MFA is disabled and Firebase token is provided", () => {
      beforeEach(() => {
        vi.mocked(MfaService.isEnabled).mockResolvedValue(false);
      });

      it("returns 200 with fresh Firebase token", async () => {
        const freshAuthTime = Math.floor(Date.now() / 1000); // now, in seconds
        mockVerifyIdToken.mockResolvedValue({ auth_time: freshAuthTime });
        const req = createMockReq({
          body: {},
          headers: {
            "user-agent": "test-agent",
            authorization: "Bearer valid-firebase-token",
          },
        });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(mockVerifyIdToken).toHaveBeenCalledWith("valid-firebase-token");
        expect(mockRecordRecentAuth).toHaveBeenCalledWith("user1");
        expect(AuditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: "AUTH_REAUTH_SUCCESS",
            userId: "user1",
            success: true,
          })
        );
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          message: "Identity verified. You can proceed with sensitive operations.",
          expiresIn: 300,
        });
      });

      it("returns 401 for stale Firebase token", async () => {
        const tenMinutesAgo = Math.floor(Date.now() / 1000) - 10 * 60; // 10 min ago in seconds
        mockVerifyIdToken.mockResolvedValue({ auth_time: tenMinutesAgo });
        const req = createMockReq({
          body: {},
          headers: {
            "user-agent": "test-agent",
            authorization: "Bearer stale-token",
          },
        });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: "Please sign in again to continue",
          code: "STALE_TOKEN",
        });
        expect(mockRecordRecentAuth).not.toHaveBeenCalled();
      });

      it("returns 401 for invalid Firebase token", async () => {
        mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));
        const req = createMockReq({
          body: {},
          headers: {
            "user-agent": "test-agent",
            authorization: "Bearer bad-token",
          },
        });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: "Identity verification failed",
          code: "INVALID_TOKEN",
        });
        expect(mockRecordRecentAuth).not.toHaveBeenCalled();
      });
    });

    // ========================================================================
    // MFA disabled — password path
    // ========================================================================
    describe("when MFA is disabled and password is provided", () => {
      beforeEach(() => {
        vi.mocked(MfaService.isEnabled).mockResolvedValue(false);
      });

      it("returns 200 on valid password", async () => {
        vi.mocked(AuthService.findUserById).mockResolvedValue({
          id: "user1",
          passwordHash: "hashed-password",
        } as any);
        vi.mocked(AuthService.verifyPassword).mockResolvedValue(true);
        const req = createMockReq({ body: { password: "correct-password" } });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(AuthService.findUserById).toHaveBeenCalledWith("user1");
        expect(AuthService.verifyPassword).toHaveBeenCalledWith(
          "correct-password",
          "hashed-password"
        );
        expect(mockRecordRecentAuth).toHaveBeenCalledWith("user1");
        expect(AuditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: "AUTH_REAUTH_SUCCESS",
            userId: "user1",
            success: true,
          })
        );
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          message: "Identity verified. You can proceed with sensitive operations.",
          expiresIn: 300,
        });
      });

      it("returns 401 for invalid password", async () => {
        vi.mocked(AuthService.findUserById).mockResolvedValue({
          id: "user1",
          passwordHash: "hashed-password",
        } as any);
        vi.mocked(AuthService.verifyPassword).mockResolvedValue(false);
        const req = createMockReq({ body: { password: "wrong-password" } });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: "Invalid password",
          code: "INVALID_PASSWORD",
        });
        expect(mockRecordRecentAuth).not.toHaveBeenCalled();
      });

      it("skips password verification for firebase-auth-user", async () => {
        vi.mocked(AuthService.findUserById).mockResolvedValue({
          id: "user1",
          passwordHash: "firebase-auth-user",
        } as any);
        const req = createMockReq({ body: { password: "any-password" } });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(AuthService.verifyPassword).not.toHaveBeenCalled();
        expect(mockRecordRecentAuth).toHaveBeenCalledWith("user1");
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      });
    });

    // ========================================================================
    // MFA disabled — no auth method provided
    // ========================================================================
    describe("when MFA is disabled and no auth method provided", () => {
      it("returns 400 when neither password nor token provided", async () => {
        vi.mocked(MfaService.isEnabled).mockResolvedValue(false);
        const req = createMockReq({ body: {} });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "Password required for identity verification",
          code: "PASSWORD_REQUIRED",
        });
        expect(mockRecordRecentAuth).not.toHaveBeenCalled();
      });
    });

    // ========================================================================
    // Success side effects
    // ========================================================================
    describe("success side effects", () => {
      it("calls recordRecentAuth and AuditLogger.log on success", async () => {
        vi.mocked(MfaService.isEnabled).mockResolvedValue(true);
        vi.mocked(MfaService.verifyCode).mockResolvedValue(true);
        const req = createMockReq({ body: { mfaCode: "123456" } });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(mockRecordRecentAuth).toHaveBeenCalledWith("user1");
        expect(AuditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: "AUTH_REAUTH_SUCCESS",
            userId: "user1",
            email: "test@example.com",
            ipAddress: "127.0.0.1",
            userAgent: "test-agent",
            success: true,
          })
        );
      });
    });

    // ========================================================================
    // Error handling
    // ========================================================================
    describe("error handling", () => {
      it("returns 500 on unexpected error", async () => {
        vi.mocked(MfaService.isEnabled).mockRejectedValue(new Error("unexpected"));
        const req = createMockReq({ body: { mfaCode: "123456" } });
        const res = createMockRes();

        await routes["POST /api/auth/verify-identity"](req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Identity verification failed" });
      });
    });
  });
});
