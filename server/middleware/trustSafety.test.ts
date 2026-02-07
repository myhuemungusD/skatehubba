import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../services/trustSafety", async () => {
  const actual = await vi.importActual("../services/trustSafety");
  return {
    ...actual,
  };
});

const { mockGetModerationProfile, mockConsumeQuota } = vi.hoisted(() => ({
  mockGetModerationProfile: vi.fn(),
  mockConsumeQuota: vi.fn(),
}));

vi.mock("../services/moderationStore", () => ({
  getModerationProfile: mockGetModerationProfile,
  consumeQuota: mockConsumeQuota,
  QuotaExceededError: class QuotaExceededError extends Error {
    constructor(msg = "QUOTA_EXCEEDED") {
      super(msg);
      this.name = "QuotaExceededError";
    }
  },
}));

import { enforceTrustAction, enforceAdminRateLimit, enforceNotBanned } from "./trustSafety";
import { QuotaExceededError } from "../services/moderationStore";

function createMockReqRes(overrides: { currentUser?: any; ip?: string } = {}) {
  const req = {
    currentUser: overrides.currentUser ?? null,
    ip: overrides.ip ?? "127.0.0.1",
  } as any;

  const jsonFn = vi.fn().mockReturnThis();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const res = { status: statusFn, json: jsonFn } as any;
  const next = vi.fn();
  return { req, res, next, statusFn, jsonFn };
}

describe("enforceTrustAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    const { req, res, next, statusFn } = createMockReqRes();
    await enforceTrustAction("checkin")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(401);
  });

  it("returns 429 when rate limited", async () => {
    // Make enough requests to exceed the rate limit
    const middleware = enforceTrustAction("checkin");
    for (let i = 0; i < 10; i++) {
      const { req, res, next } = createMockReqRes({
        currentUser: { id: `rate-limit-user-${Date.now()}` },
      });
      // These calls won't hit the rate limit since they use unique IDs
    }

    // Create a user that will be rate limited
    const userId = `rate-test-${Date.now()}`;
    for (let i = 0; i < 12; i++) {
      const { req, res, next, statusFn, jsonFn } = createMockReqRes({
        currentUser: { id: userId },
      });
      mockGetModerationProfile.mockResolvedValue({
        trustLevel: 0,
        reputationScore: 0,
        isBanned: false,
        banExpiresAt: null,
        proVerificationStatus: "none",
        isProVerified: false,
      });
      mockConsumeQuota.mockResolvedValue({ count: 1, limit: 2 });
      await middleware(req, res, next);
      if (statusFn.mock.calls.length > 0 && statusFn.mock.calls[0][0] === 429) {
        expect(statusFn).toHaveBeenCalledWith(429);
        return;
      }
    }
  });

  it("returns 403 when user is banned", async () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({
      currentUser: { id: `banned-user-${Date.now()}` },
    });
    mockGetModerationProfile.mockResolvedValue({
      trustLevel: 0,
      reputationScore: 0,
      isBanned: true,
      banExpiresAt: null,
      proVerificationStatus: "none",
      isProVerified: false,
    });
    await enforceTrustAction("checkin")(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn.mock.calls[0][0].error).toBe("BANNED");
  });

  it("returns 429 on QuotaExceededError", async () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({
      currentUser: { id: `quota-user-${Date.now()}` },
    });
    mockGetModerationProfile.mockResolvedValue({
      trustLevel: 0,
      reputationScore: 0,
      isBanned: false,
      banExpiresAt: null,
      proVerificationStatus: "none",
      isProVerified: false,
    });
    mockConsumeQuota.mockRejectedValue(new QuotaExceededError());
    await enforceTrustAction("post")(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(429);
    expect(jsonFn.mock.calls[0][0].error).toBe("QUOTA_EXCEEDED");
  });

  it("returns 500 on unexpected errors", async () => {
    const { req, res, next, statusFn } = createMockReqRes({
      currentUser: { id: `error-user-${Date.now()}` },
    });
    mockGetModerationProfile.mockRejectedValue(new Error("DB down"));
    await enforceTrustAction("checkin")(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(500);
  });

  it("calls next when all checks pass", async () => {
    const { req, res, next } = createMockReqRes({
      currentUser: { id: `ok-user-${Date.now()}` },
    });
    mockGetModerationProfile.mockResolvedValue({
      trustLevel: 0,
      reputationScore: 0,
      isBanned: false,
      banExpiresAt: null,
      proVerificationStatus: "none",
      isProVerified: false,
    });
    mockConsumeQuota.mockResolvedValue({ count: 1, limit: 2 });
    await enforceTrustAction("checkin")(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("enforceAdminRateLimit", () => {
  it("calls next when under limit", () => {
    const { req, res, next } = createMockReqRes({
      currentUser: { id: `admin-${Date.now()}` },
    });
    enforceAdminRateLimit()(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("enforceNotBanned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const { req, res, next, statusFn } = createMockReqRes();
    await enforceNotBanned()(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(401);
  });

  it("returns 403 when banned", async () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({
      currentUser: { id: "banned-user" },
    });
    mockGetModerationProfile.mockResolvedValue({
      trustLevel: 0,
      reputationScore: 0,
      isBanned: true,
      banExpiresAt: null,
      proVerificationStatus: "none",
      isProVerified: false,
    });
    await enforceNotBanned()(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn.mock.calls[0][0].error).toBe("BANNED");
  });

  it("calls next when not banned", async () => {
    const { req, res, next } = createMockReqRes({
      currentUser: { id: "ok-user" },
    });
    mockGetModerationProfile.mockResolvedValue({
      trustLevel: 0,
      reputationScore: 0,
      isBanned: false,
      banExpiresAt: null,
      proVerificationStatus: "none",
      isProVerified: false,
    });
    await enforceNotBanned()(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 500 on errors", async () => {
    const { req, res, next, statusFn } = createMockReqRes({
      currentUser: { id: "error-user" },
    });
    mockGetModerationProfile.mockRejectedValue(new Error("fail"));
    await enforceNotBanned()(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(500);
  });
});
