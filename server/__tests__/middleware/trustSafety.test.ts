/**
 * @fileoverview Coverage tests for server/middleware/trustSafety.ts
 *
 * Covers:
 *  - enforceTrustAction with all action types (checkin, post, report)
 *  - enforceTrustAction with unknown action — exercises the `default` branch in getLimiter (line 27)
 *  - enforceTrustAction when user is not authenticated
 *  - enforceTrustAction when user is rate limited
 *  - enforceTrustAction when user is banned (with and without expiresAt)
 *  - enforceTrustAction when consumeQuota throws QuotaExceededError
 *  - enforceTrustAction when getModerationProfile throws generic error
 *  - enforceAdminRateLimit with user id, ip, and unknown key
 *  - enforceAdminRateLimit when rate limited
 *  - enforceNotBanned when not authenticated
 *  - enforceNotBanned when banned
 *  - enforceNotBanned when not banned
 *  - enforceNotBanned when getModerationProfile throws
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCheck = vi.fn();
const mockGetModerationProfile = vi.fn();
const mockGetBanStatus = vi.fn();
const mockConsumeQuota = vi.fn();

vi.mock("../../services/trustSafety", () => ({
  createInMemoryRateLimiter: () => ({ check: mockCheck }),
  getBanStatus: (...args: any[]) => mockGetBanStatus(...args),
}));

vi.mock("../../services/moderationStore", () => ({
  consumeQuota: (...args: any[]) => mockConsumeQuota(...args),
  getModerationProfile: (...args: any[]) => mockGetModerationProfile(...args),
  QuotaExceededError: class QuotaExceededError extends Error {
    constructor(msg?: string) {
      super(msg ?? "Quota exceeded");
      this.name = "QuotaExceededError";
    }
  },
}));

// Import after mocks
const { enforceTrustAction, enforceAdminRateLimit, enforceNotBanned } = await import(
  "../../middleware/trustSafety"
);
// Also import the mocked QuotaExceededError class for instanceof checks
const { QuotaExceededError } = await import("../../services/moderationStore");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createReq(overrides: any = {}): Request {
  return {
    currentUser: overrides.currentUser ?? null,
    ip: overrides.ip ?? "127.0.0.1",
    ...overrides,
  } as unknown as Request;
}

function createRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function createNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("trustSafety middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockReturnValue({ allowed: true, retryAfterMs: 0 });
    mockGetModerationProfile.mockResolvedValue({
      trustLevel: 1,
      reputationScore: 50,
      isBanned: false,
      banExpiresAt: null,
      proVerificationStatus: "none",
      isProVerified: false,
    });
    mockGetBanStatus.mockReturnValue({ isBanned: false, expired: false, expiresAt: null });
    mockConsumeQuota.mockResolvedValue(undefined);
  });

  // =========================================================================
  // enforceTrustAction
  // =========================================================================

  describe("enforceTrustAction", () => {
    it("should return 401 when user is not authenticated", async () => {
      const middleware = enforceTrustAction("checkin");
      const req = createReq({ currentUser: null });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 429 when rate limited", async () => {
      mockCheck.mockReturnValue({ allowed: false, retryAfterMs: 5000 });

      const middleware = enforceTrustAction("checkin");
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: "RATE_LIMITED",
        retryAfterMs: 5000,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 when user is banned with expiresAt", async () => {
      const banExpiry = new Date("2099-01-01");
      mockGetBanStatus.mockReturnValue({
        isBanned: true,
        expired: false,
        expiresAt: banExpiry,
      });

      const middleware = enforceTrustAction("checkin");
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "BANNED",
        expiresAt: banExpiry.toISOString(),
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 when user is permanently banned (null expiresAt)", async () => {
      mockGetBanStatus.mockReturnValue({
        isBanned: true,
        expired: false,
        expiresAt: null,
      });

      const middleware = enforceTrustAction("checkin");
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "BANNED",
        expiresAt: null,
      });
    });

    it("should call next() when all checks pass for 'checkin' action", async () => {
      const middleware = enforceTrustAction("checkin");
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should call next() when all checks pass for 'post' action", async () => {
      const middleware = enforceTrustAction("post");
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should call next() when all checks pass for 'report' action", async () => {
      const middleware = enforceTrustAction("report");
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should use default (checkin) rate limiter for unknown action (line 27)", async () => {
      // Passing an unknown action string triggers the `default` case in getLimiter
      const middleware = enforceTrustAction("unknown-action" as any);
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      // The default branch returns checkInRateLimiter, which is the same mock
      expect(mockCheck).toHaveBeenCalledWith("user1");
      expect(next).toHaveBeenCalled();
    });

    it("should return 429 when consumeQuota throws QuotaExceededError", async () => {
      mockConsumeQuota.mockRejectedValue(new QuotaExceededError());

      const middleware = enforceTrustAction("checkin");
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({ error: "QUOTA_EXCEEDED" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 500 when getModerationProfile throws a generic error", async () => {
      mockGetModerationProfile.mockRejectedValue(new Error("DB connection failed"));

      const middleware = enforceTrustAction("checkin");
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "MODERATION_CHECK_FAILED" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // enforceAdminRateLimit
  // =========================================================================

  describe("enforceAdminRateLimit", () => {
    it("should use currentUser.id as key when available", () => {
      const middleware = enforceAdminRateLimit();
      const req = createReq({ currentUser: { id: "admin-user" } });
      const res = createRes();
      const next = createNext();

      middleware(req, res, next);

      expect(mockCheck).toHaveBeenCalledWith("admin-user");
      expect(next).toHaveBeenCalled();
    });

    it("should fall back to req.ip when currentUser is absent", () => {
      const middleware = enforceAdminRateLimit();
      const req = createReq({ currentUser: null, ip: "10.0.0.1" });
      const res = createRes();
      const next = createNext();

      middleware(req, res, next);

      expect(mockCheck).toHaveBeenCalledWith("10.0.0.1");
      expect(next).toHaveBeenCalled();
    });

    it("should fall back to 'unknown' when both currentUser and ip are absent", () => {
      const middleware = enforceAdminRateLimit();
      const req = createReq({ currentUser: null, ip: undefined });
      const res = createRes();
      const next = createNext();

      middleware(req, res, next);

      expect(mockCheck).toHaveBeenCalledWith("unknown");
      expect(next).toHaveBeenCalled();
    });

    it("should return 429 when admin rate limited", () => {
      mockCheck.mockReturnValue({ allowed: false, retryAfterMs: 3000 });

      const middleware = enforceAdminRateLimit();
      const req = createReq({ currentUser: { id: "admin-user" } });
      const res = createRes();
      const next = createNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: "RATE_LIMITED",
        retryAfterMs: 3000,
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // enforceNotBanned
  // =========================================================================

  describe("enforceNotBanned", () => {
    it("should return 401 when user is not authenticated", async () => {
      const middleware = enforceNotBanned();
      const req = createReq({ currentUser: null });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 when user is banned with expiresAt", async () => {
      const banExpiry = new Date("2099-06-15");
      mockGetBanStatus.mockReturnValue({
        isBanned: true,
        expired: false,
        expiresAt: banExpiry,
      });

      const middleware = enforceNotBanned();
      const req = createReq({ currentUser: { id: "banned-user" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "BANNED",
        expiresAt: banExpiry.toISOString(),
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 when user is permanently banned (null expiresAt)", async () => {
      mockGetBanStatus.mockReturnValue({
        isBanned: true,
        expired: false,
        expiresAt: null,
      });

      const middleware = enforceNotBanned();
      const req = createReq({ currentUser: { id: "banned-user" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "BANNED",
        expiresAt: null,
      });
    });

    it("should call next() when user is not banned", async () => {
      const middleware = enforceNotBanned();
      const req = createReq({ currentUser: { id: "good-user" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 500 when getModerationProfile throws", async () => {
      mockGetModerationProfile.mockRejectedValue(new Error("DB error"));

      const middleware = enforceNotBanned();
      const req = createReq({ currentUser: { id: "user1" } });
      const res = createRes();
      const next = createNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "MODERATION_CHECK_FAILED" });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
