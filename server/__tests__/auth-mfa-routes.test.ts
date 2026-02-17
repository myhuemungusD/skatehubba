/**
 * @fileoverview Unit tests for MFA route handlers
 *
 * Tests route handlers directly by capturing Express app registrations.
 *
 * GET  /api/auth/mfa/status       — Check if MFA is enabled
 * POST /api/auth/mfa/setup        — Initiate MFA setup
 * POST /api/auth/mfa/verify-setup — Complete MFA setup with first code
 * POST /api/auth/mfa/verify       — Verify MFA code during login
 * POST /api/auth/mfa/disable      — Disable MFA
 * POST /api/auth/mfa/backup-codes — Regenerate backup codes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.currentUser = { id: "user1", email: "test@example.com", firstName: "Test" };
    next();
  }),
}));

vi.mock("../middleware/csrf", () => ({
  requireCsrfToken: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../auth/mfa", () => ({
  MfaService: {
    isEnabled: vi.fn(),
    initiateSetup: vi.fn(),
    verifySetup: vi.fn(),
    verifyCode: vi.fn(),
    verifyBackupCode: vi.fn(),
    disable: vi.fn(),
    regenerateBackupCodes: vi.fn(),
  },
}));

vi.mock("../auth/audit", () => ({
  getClientIP: vi.fn(() => "127.0.0.1"),
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

import { setupMfaRoutes } from "../auth/routes/mfa.ts";
import { MfaService } from "../auth/mfa.ts";

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

describe("MFA Routes", () => {
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

    setupMfaRoutes(mockApp as any);
  });

  // --------------------------------------------------------------------------
  // GET /api/auth/mfa/status
  // --------------------------------------------------------------------------
  describe("GET /api/auth/mfa/status", () => {
    it("returns enabled: true when MFA is enabled", async () => {
      vi.mocked(MfaService.isEnabled).mockResolvedValue(true);
      const req = createMockReq();
      const res = createMockRes();

      await routes["GET /api/auth/mfa/status"](req, res);

      expect(MfaService.isEnabled).toHaveBeenCalledWith("user1");
      expect(res.json).toHaveBeenCalledWith({
        enabled: true,
        userId: "user1",
      });
    });

    it("returns enabled: false when MFA is not enabled", async () => {
      vi.mocked(MfaService.isEnabled).mockResolvedValue(false);
      const req = createMockReq();
      const res = createMockRes();

      await routes["GET /api/auth/mfa/status"](req, res);

      expect(MfaService.isEnabled).toHaveBeenCalledWith("user1");
      expect(res.json).toHaveBeenCalledWith({
        enabled: false,
        userId: "user1",
      });
    });

    it("returns 500 on error", async () => {
      vi.mocked(MfaService.isEnabled).mockRejectedValue(new Error("db error"));
      const req = createMockReq();
      const res = createMockRes();

      await routes["GET /api/auth/mfa/status"](req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to check MFA status" });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/auth/mfa/setup
  // --------------------------------------------------------------------------
  describe("POST /api/auth/mfa/setup", () => {
    it("returns setup data (secret, qrCodeUrl, backupCodes)", async () => {
      vi.mocked(MfaService.isEnabled).mockResolvedValue(false);
      vi.mocked(MfaService.initiateSetup).mockResolvedValue({
        secret: "ABCDEF123456",
        qrCodeUrl: "otpauth://totp/SkateHubba:test@example.com?secret=ABCDEF123456",
        backupCodes: ["code1", "code2", "code3"],
      });
      const req = createMockReq();
      const res = createMockRes();

      await routes["POST /api/auth/mfa/setup"](req, res);

      expect(MfaService.isEnabled).toHaveBeenCalledWith("user1");
      expect(MfaService.initiateSetup).toHaveBeenCalledWith("user1", "test@example.com");
      expect(res.json).toHaveBeenCalledWith({
        secret: "ABCDEF123456",
        qrCodeUrl: "otpauth://totp/SkateHubba:test@example.com?secret=ABCDEF123456",
        backupCodes: ["code1", "code2", "code3"],
        message: "Scan the QR code with your authenticator app, then verify with a code.",
      });
    });

    it("returns 400 if MFA already enabled", async () => {
      vi.mocked(MfaService.isEnabled).mockResolvedValue(true);
      const req = createMockReq();
      const res = createMockRes();

      await routes["POST /api/auth/mfa/setup"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "MFA is already enabled. Disable it first to set up again.",
        code: "MFA_ALREADY_ENABLED",
      });
      expect(MfaService.initiateSetup).not.toHaveBeenCalled();
    });

    it("returns 500 on error", async () => {
      vi.mocked(MfaService.isEnabled).mockResolvedValue(false);
      vi.mocked(MfaService.initiateSetup).mockRejectedValue(new Error("setup failed"));
      const req = createMockReq();
      const res = createMockRes();

      await routes["POST /api/auth/mfa/setup"](req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to initiate MFA setup" });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/auth/mfa/verify-setup
  // --------------------------------------------------------------------------
  describe("POST /api/auth/mfa/verify-setup", () => {
    it("returns success when code is valid", async () => {
      vi.mocked(MfaService.verifySetup).mockResolvedValue(true);
      const req = createMockReq({ body: { code: "123456" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify-setup"](req, res);

      expect(MfaService.verifySetup).toHaveBeenCalledWith(
        "user1",
        "test@example.com",
        "123456",
        "127.0.0.1",
        "test-agent"
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "MFA has been enabled successfully.",
      });
    });

    it("returns 400 for missing code", async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify-setup"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Valid 6-digit code required",
        code: "INVALID_CODE_FORMAT",
      });
      expect(MfaService.verifySetup).not.toHaveBeenCalled();
    });

    it("returns 400 for code with wrong length", async () => {
      const req = createMockReq({ body: { code: "1234" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify-setup"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Valid 6-digit code required",
        code: "INVALID_CODE_FORMAT",
      });
      expect(MfaService.verifySetup).not.toHaveBeenCalled();
    });

    it("returns 400 for non-string code", async () => {
      const req = createMockReq({ body: { code: 123456 } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify-setup"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Valid 6-digit code required",
        code: "INVALID_CODE_FORMAT",
      });
    });

    it("returns 400 when verification fails", async () => {
      vi.mocked(MfaService.verifySetup).mockResolvedValue(false);
      const req = createMockReq({ body: { code: "999999" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify-setup"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid verification code. Please try again.",
        code: "INVALID_CODE",
      });
    });

    it("returns 500 on error", async () => {
      vi.mocked(MfaService.verifySetup).mockRejectedValue(new Error("verify failed"));
      const req = createMockReq({ body: { code: "123456" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify-setup"](req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to verify MFA setup" });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/auth/mfa/verify
  // --------------------------------------------------------------------------
  describe("POST /api/auth/mfa/verify", () => {
    it("returns success with valid TOTP code", async () => {
      vi.mocked(MfaService.verifyCode).mockResolvedValue(true);
      const req = createMockReq({ body: { code: "123456" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify"](req, res);

      expect(MfaService.verifyCode).toHaveBeenCalledWith(
        "user1",
        "test@example.com",
        "123456",
        "127.0.0.1",
        "test-agent"
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "MFA verification successful.",
      });
    });

    it("returns success with valid backup code", async () => {
      vi.mocked(MfaService.verifyBackupCode).mockResolvedValue(true);
      const req = createMockReq({ body: { code: "backup-code-1", isBackupCode: true } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify"](req, res);

      expect(MfaService.verifyBackupCode).toHaveBeenCalledWith(
        "user1",
        "test@example.com",
        "backup-code-1",
        "127.0.0.1",
        "test-agent"
      );
      expect(MfaService.verifyCode).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "MFA verification successful.",
      });
    });

    it("returns 400 when code is missing", async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Code is required",
        code: "MISSING_CODE",
      });
    });

    it("returns 400 when code is not a string", async () => {
      const req = createMockReq({ body: { code: 123456 } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Code is required",
        code: "MISSING_CODE",
      });
    });

    it("returns 401 when TOTP code is invalid", async () => {
      vi.mocked(MfaService.verifyCode).mockResolvedValue(false);
      const req = createMockReq({ body: { code: "999999" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify"](req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid code. Please try again.",
        code: "INVALID_CODE",
      });
    });

    it("returns 401 when backup code is invalid", async () => {
      vi.mocked(MfaService.verifyBackupCode).mockResolvedValue(false);
      const req = createMockReq({ body: { code: "bad-backup", isBackupCode: true } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify"](req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid code. Please try again.",
        code: "INVALID_CODE",
      });
    });

    it("returns 500 on error", async () => {
      vi.mocked(MfaService.verifyCode).mockRejectedValue(new Error("verify failed"));
      const req = createMockReq({ body: { code: "123456" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/verify"](req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "MFA verification failed" });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/auth/mfa/disable
  // --------------------------------------------------------------------------
  describe("POST /api/auth/mfa/disable", () => {
    it("returns success when code valid and MFA disabled", async () => {
      vi.mocked(MfaService.verifyCode).mockResolvedValue(true);
      vi.mocked(MfaService.disable).mockResolvedValue(undefined);
      const req = createMockReq({ body: { code: "123456" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/disable"](req, res);

      expect(MfaService.verifyCode).toHaveBeenCalledWith(
        "user1",
        "test@example.com",
        "123456",
        "127.0.0.1",
        "test-agent"
      );
      expect(MfaService.disable).toHaveBeenCalledWith(
        "user1",
        "test@example.com",
        "127.0.0.1",
        "test-agent"
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "MFA has been disabled.",
      });
    });

    it("returns 400 when code is missing", async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/disable"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Current MFA code required to disable",
        code: "MISSING_CODE",
      });
      expect(MfaService.verifyCode).not.toHaveBeenCalled();
    });

    it("returns 400 when code is not a string", async () => {
      const req = createMockReq({ body: { code: 123 } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/disable"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Current MFA code required to disable",
        code: "MISSING_CODE",
      });
    });

    it("returns 401 when code is invalid", async () => {
      vi.mocked(MfaService.verifyCode).mockResolvedValue(false);
      const req = createMockReq({ body: { code: "999999" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/disable"](req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid MFA code",
        code: "INVALID_CODE",
      });
      expect(MfaService.disable).not.toHaveBeenCalled();
    });

    it("returns 500 on error", async () => {
      vi.mocked(MfaService.verifyCode).mockResolvedValue(true);
      vi.mocked(MfaService.disable).mockRejectedValue(new Error("disable failed"));
      const req = createMockReq({ body: { code: "123456" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/disable"](req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to disable MFA" });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/auth/mfa/backup-codes
  // --------------------------------------------------------------------------
  describe("POST /api/auth/mfa/backup-codes", () => {
    it("returns new backup codes when code is valid", async () => {
      vi.mocked(MfaService.verifyCode).mockResolvedValue(true);
      vi.mocked(MfaService.regenerateBackupCodes).mockResolvedValue([
        "new-code-1",
        "new-code-2",
        "new-code-3",
      ]);
      const req = createMockReq({ body: { code: "123456" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/backup-codes"](req, res);

      expect(MfaService.verifyCode).toHaveBeenCalledWith(
        "user1",
        "test@example.com",
        "123456",
        "127.0.0.1",
        "test-agent"
      );
      expect(MfaService.regenerateBackupCodes).toHaveBeenCalledWith(
        "user1",
        "test@example.com",
        "127.0.0.1",
        "test-agent"
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        backupCodes: ["new-code-1", "new-code-2", "new-code-3"],
        message: "New backup codes generated. Please save them securely.",
      });
    });

    it("returns 400 when code is missing", async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/backup-codes"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Current MFA code required",
        code: "MISSING_CODE",
      });
      expect(MfaService.verifyCode).not.toHaveBeenCalled();
    });

    it("returns 400 when code is not a string", async () => {
      const req = createMockReq({ body: { code: 123 } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/backup-codes"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Current MFA code required",
        code: "MISSING_CODE",
      });
    });

    it("returns 401 when code is invalid", async () => {
      vi.mocked(MfaService.verifyCode).mockResolvedValue(false);
      const req = createMockReq({ body: { code: "999999" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/backup-codes"](req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid MFA code",
        code: "INVALID_CODE",
      });
      expect(MfaService.regenerateBackupCodes).not.toHaveBeenCalled();
    });

    it("returns 400 when MFA not enabled (regenerateBackupCodes returns null)", async () => {
      vi.mocked(MfaService.verifyCode).mockResolvedValue(true);
      vi.mocked(MfaService.regenerateBackupCodes).mockResolvedValue(null as any);
      const req = createMockReq({ body: { code: "123456" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/backup-codes"](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "MFA is not enabled",
        code: "MFA_NOT_ENABLED",
      });
    });

    it("returns 500 on error", async () => {
      vi.mocked(MfaService.verifyCode).mockResolvedValue(true);
      vi.mocked(MfaService.regenerateBackupCodes).mockRejectedValue(new Error("regen failed"));
      const req = createMockReq({ body: { code: "123456" } });
      const res = createMockRes();

      await routes["POST /api/auth/mfa/backup-codes"](req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to regenerate backup codes" });
    });
  });
});
