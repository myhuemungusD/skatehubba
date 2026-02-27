/**
 * Behavior tests for HTTP middleware
 *
 * Tests security middleware (rate limit key generation, static file bypass),
 * Redis-backed rate limit store creation, and trust/safety enforcement
 * including admin rate limiting.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

// ── Rate-limit capture ───────────────────────────────────────────────────
// Capture every options object passed to rateLimit() during module init
// so we can test keyGenerator and skip callbacks directly.

const rateLimitCalls: Record<string, unknown>[] = [];

vi.mock("express-rate-limit", () => ({
  default: (opts: Record<string, unknown>) => {
    rateLimitCalls.push(opts);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
  __esModule: true,
}));

vi.mock("rate-limit-redis", () => ({
  RedisStore: class FakeRedisStore {
    constructor() {
      /* noop */
    }
  },
}));

vi.mock("../../redis", () => ({
  getRedisClient: () => null,
}));

vi.mock("../../config/rateLimits", () => {
  const stub = {
    windowMs: 60_000,
    max: 100,
    message: "rate limited",
    prefix: "rl:stub:",
  };
  return {
    RATE_LIMIT_CONFIG: {
      emailSignup: stub,
      publicWrite: stub,
      checkInIp: stub,
      perUserSpotWrite: stub,
      perUserCheckIn: stub,
      passwordReset: stub,
      api: stub,
      usernameCheck: stub,
      profileCreate: stub,
      staticFile: stub,
      quickMatch: stub,
      spotRating: stub,
      spotDiscovery: stub,
      proAward: stub,
      authLogin: stub,
      ai: stub,
      profileRead: stub,
      remoteSkate: stub,
    },
  };
});

await import("../security");

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Locate the profileCreateLimiter keyGenerator among captured rate-limit options.
 * It reads firebaseUid (unlike userKeyGenerator which calls req.get()).
 */
function findProfileCreateKeyGenerator(): ((req: Request) => string) | undefined {
  for (const opts of rateLimitCalls) {
    if (typeof opts.keyGenerator !== "function") continue;
    const fn = opts.keyGenerator as (req: Request) => string;
    try {
      const testReq = { ip: "1.2.3.4", firebaseUid: "__probe__" } as any;
      const result = fn(testReq);
      if (result === "__probe__") return fn;
    } catch {
      // userKeyGenerator calls req.get() which throws on bare objects — skip
    }
  }
  return undefined;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Profile creation rate limiter", () => {
  let keyGenerator: ((req: Request) => string) | undefined;

  beforeEach(() => {
    keyGenerator = findProfileCreateKeyGenerator();
  });

  it("uses Firebase UID as rate-limit key when authenticated", () => {
    expect(keyGenerator).toBeDefined();
    const req = { ip: "10.0.0.1", firebaseUid: "firebase-abc-123" } as any;
    expect(keyGenerator!(req)).toBe("firebase-abc-123");
  });

  it("falls back to IP address when Firebase UID is absent", () => {
    expect(keyGenerator).toBeDefined();
    const req = { ip: "192.168.1.1" } as any;
    expect(keyGenerator!(req)).toBe("192.168.1.1");
  });

  it("uses 'unknown' key when both UID and IP are absent", () => {
    expect(keyGenerator).toBeDefined();
    const req = {} as any;
    expect(keyGenerator!(req)).toBe("unknown");
  });
});

describe("Static file rate limiter", () => {
  let skipFn: ((req: Request) => boolean) | undefined;

  beforeEach(() => {
    for (const opts of rateLimitCalls) {
      if (typeof opts.skip === "function") {
        skipFn = opts.skip as (req: Request) => boolean;
        break;
      }
    }
  });

  it("is configured", () => {
    expect(skipFn).toBeDefined();
  });

  it.each([
    ".css",
    ".js",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
  ])("bypasses rate limiting for %s files", (ext) => {
    const req = { path: `/assets/file${ext}` } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("bypasses rate limiting case-insensitively (e.g. .PNG)", () => {
    const req = { path: "/images/logo.PNG" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("does not bypass rate limiting for HTML files", () => {
    const req = { path: "/index.html" } as Request;
    expect(skipFn!(req)).toBe(false);
  });

  it("does not bypass rate limiting for API paths", () => {
    const req = { path: "/api/spots" } as Request;
    expect(skipFn!(req)).toBe(false);
  });

  it("does not bypass rate limiting for JSON files", () => {
    const req = { path: "/data/config.json" } as Request;
    expect(skipFn!(req)).toBe(false);
  });
});

describe("Redis-backed rate limit store", () => {
  it("creates a RedisStore with sendCommand that delegates to redis.call", async () => {
    const redisStoreInstances: { sendCommand: unknown; prefix: string }[] = [];
    const mockRedisCall = vi.fn().mockResolvedValue(42);
    const fakeRedisClient = { call: mockRedisCall };

    vi.doMock("../../redis", () => ({
      getRedisClient: () => fakeRedisClient,
    }));

    vi.doMock("rate-limit-redis", () => ({
      RedisStore: class MockRedisStore {
        constructor(opts: { sendCommand: (...args: string[]) => Promise<number>; prefix: string }) {
          redisStoreInstances.push(opts);
        }
      },
    }));

    const mod = await import("../rateLimit");

    expect(redisStoreInstances.length).toBeGreaterThanOrEqual(2);

    const { sendCommand, prefix } = redisStoreInstances[0];
    expect(prefix).toBeDefined();
    expect(typeof sendCommand).toBe("function");

    const result = await (sendCommand as (...args: string[]) => Promise<number>)(
      "INCR",
      "rl:auth:127.0.0.1"
    );
    expect(mockRedisCall).toHaveBeenCalledWith("INCR", "rl:auth:127.0.0.1");
    expect(result).toBe(42);

    expect(typeof mod.authLimiter).toBe("function");
    expect(typeof mod.aiLimiter).toBe("function");
  });
});

// ── Trust & Safety middleware ────────────────────────────────────────────

const { mockGetModerationProfile, mockConsumeQuota } = vi.hoisted(() => ({
  mockGetModerationProfile: vi.fn(),
  mockConsumeQuota: vi.fn(),
}));

vi.mock("../../services/moderationStore", () => ({
  getModerationProfile: mockGetModerationProfile,
  consumeQuota: mockConsumeQuota,
  QuotaExceededError: class QuotaExceededError extends Error {
    constructor(msg = "QUOTA_EXCEEDED") {
      super(msg);
      this.name = "QuotaExceededError";
    }
  },
}));

vi.mock("../../services/trustSafety", async () => {
  const actual = await vi.importActual("../../services/trustSafety");
  return { ...actual };
});

const { enforceTrustAction, enforceAdminRateLimit } = await import("../trustSafety");

function createMockReqRes(overrides: { currentUser?: { id: string }; ip?: string } = {}) {
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

describe("Trust action enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to default limiter for unrecognized action types", async () => {
    const userId = `default-action-user-${Date.now()}`;
    const { req, res, next } = createMockReqRes({ currentUser: { id: userId } });

    mockGetModerationProfile.mockResolvedValue({
      trustLevel: 0,
      reputationScore: 0,
      isBanned: false,
      banExpiresAt: null,
      proVerificationStatus: "none",
      isProVerified: false,
    });
    mockConsumeQuota.mockResolvedValue({ count: 1, limit: 10 });

    await enforceTrustAction("unknown-action" as any)(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe("Admin rate limiting", () => {
  it("returns 429 with retryAfterMs when rate limit is exceeded", () => {
    const userId = `admin-rl-${Date.now()}`;
    const middleware = enforceAdminRateLimit();

    let rateLimited = false;

    for (let i = 0; i < 25; i++) {
      const { req, res, next, statusFn, jsonFn } = createMockReqRes({
        currentUser: { id: userId },
      });

      middleware(req, res, next);

      if (statusFn.mock.calls.length > 0 && statusFn.mock.calls[0][0] === 429) {
        rateLimited = true;
        expect(statusFn).toHaveBeenCalledWith(429);
        expect(jsonFn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: "RATE_LIMITED",
            retryAfterMs: expect.any(Number),
          })
        );
        break;
      }
    }

    expect(rateLimited).toBe(true);
  });

  it("uses IP address as key when user is not authenticated", () => {
    const middleware = enforceAdminRateLimit();
    const { req, res, next } = createMockReqRes({ ip: "10.10.10.10" });
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("uses 'unknown' as key when neither user nor IP is available", () => {
    const middleware = enforceAdminRateLimit();
    const req = { currentUser: null, ip: undefined } as any;
    const jsonFn = vi.fn().mockReturnThis();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn, json: jsonFn } as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
