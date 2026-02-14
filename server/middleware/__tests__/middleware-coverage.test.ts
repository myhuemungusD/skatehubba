/**
 * Targeted coverage tests for previously uncovered lines in middleware files:
 *
 * 1. security.ts  - profileCreateLimiter keyGenerator  (lines ~154-156)
 * 2. security.ts  - staticFileLimiter skip callback     (lines ~178-179)
 * 3. rateLimit.ts - buildStore with a live Redis client  (lines 14-16)
 * 4. trustSafety.ts - getLimiter default branch          (lines 25-27)
 * 5. trustSafety.ts - enforceAdminRateLimit 429 path     (line 75)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

// ---------------------------------------------------------------------------
// 1 & 2  --  security.ts: profileCreateLimiter keyGenerator & staticFileLimiter skip
// ---------------------------------------------------------------------------
//
// We need rateLimit() to capture the options (keyGenerator, skip) so we can
// invoke them directly.  We replace express-rate-limit with a spy factory.
// ---------------------------------------------------------------------------

// Accumulate every options object passed to rateLimit() during module init.
const rateLimitCalls: Record<string, unknown>[] = [];

vi.mock("express-rate-limit", () => ({
  default: (opts: Record<string, unknown>) => {
    rateLimitCalls.push(opts);
    // Return a no-op middleware
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
    },
  };
});

// Import security module -- triggers all module-level rateLimit() calls
await import("../security");

/**
 * Find the profileCreateLimiter keyGenerator among all captured rateLimit options.
 *
 * The profileCreate keyGenerator reads `(req as FirebaseAuthedRequest).firebaseUid`
 * then falls back to `req.ip` then "unknown".  It does NOT call req.get().
 *
 * The userKeyGenerator (used by perUserSpotWrite, perUserCheckIn, quickMatch,
 * spotRating, proAward) calls `req.get()` which will throw on a bare object.
 * We use try/catch to skip those.
 */
function findProfileCreateKeyGenerator(): ((req: Request) => string) | undefined {
  for (const opts of rateLimitCalls) {
    if (typeof opts.keyGenerator !== "function") continue;
    const fn = opts.keyGenerator as (req: Request) => string;
    try {
      const testReq = { ip: "1.2.3.4", firebaseUid: "__probe__" } as any;
      const result = fn(testReq);
      if (result === "__probe__") {
        return fn;
      }
    } catch {
      // userKeyGenerator calls req.get() which throws on bare objects -- skip
    }
  }
  return undefined;
}

describe("security.ts - profileCreateLimiter keyGenerator", () => {
  let keyGenerator: ((req: Request) => string) | undefined;

  beforeEach(() => {
    keyGenerator = findProfileCreateKeyGenerator();
  });

  it("should return firebaseUid when present on the request", () => {
    expect(keyGenerator).toBeDefined();
    const req = { ip: "10.0.0.1", firebaseUid: "firebase-abc-123" } as any;
    const key = keyGenerator!(req);
    expect(key).toBe("firebase-abc-123");
  });

  it("should fall back to req.ip when firebaseUid is absent", () => {
    expect(keyGenerator).toBeDefined();
    const req = { ip: "192.168.1.1" } as any;
    const key = keyGenerator!(req);
    expect(key).toBe("192.168.1.1");
  });

  it("should return 'unknown' when both firebaseUid and ip are absent", () => {
    expect(keyGenerator).toBeDefined();
    const req = {} as any;
    const key = keyGenerator!(req);
    expect(key).toBe("unknown");
  });
});

describe("security.ts - staticFileLimiter skip callback", () => {
  let skipFn: ((req: Request) => boolean) | undefined;

  beforeEach(() => {
    // The staticFileLimiter is the only rateLimit() call with a `skip` option.
    for (const opts of rateLimitCalls) {
      if (typeof opts.skip === "function") {
        skipFn = opts.skip as (req: Request) => boolean;
        break;
      }
    }
  });

  it("should be defined", () => {
    expect(skipFn).toBeDefined();
  });

  it("should skip .css files", () => {
    const req = { path: "/assets/style.css" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .js files", () => {
    const req = { path: "/assets/bundle.js" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .png files", () => {
    const req = { path: "/images/logo.png" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .jpg files", () => {
    const req = { path: "/photos/hero.jpg" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .jpeg files", () => {
    const req = { path: "/photos/hero.jpeg" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .gif files", () => {
    const req = { path: "/images/anim.gif" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .svg files", () => {
    const req = { path: "/icons/check.svg" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .ico files", () => {
    const req = { path: "/favicon.ico" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .woff files", () => {
    const req = { path: "/fonts/Inter.woff" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .woff2 files", () => {
    const req = { path: "/fonts/Inter.woff2" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .ttf files", () => {
    const req = { path: "/fonts/Inter.ttf" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should skip .eot files", () => {
    const req = { path: "/fonts/Inter.eot" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should be case-insensitive (e.g. .PNG)", () => {
    const req = { path: "/images/logo.PNG" } as Request;
    expect(skipFn!(req)).toBe(true);
  });

  it("should NOT skip HTML files", () => {
    const req = { path: "/index.html" } as Request;
    expect(skipFn!(req)).toBe(false);
  });

  it("should NOT skip paths without static extensions", () => {
    const req = { path: "/api/spots" } as Request;
    expect(skipFn!(req)).toBe(false);
  });

  it("should NOT skip .json files", () => {
    const req = { path: "/data/config.json" } as Request;
    expect(skipFn!(req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3  --  rateLimit.ts: buildStore when Redis IS available (lines 14-16)
// ---------------------------------------------------------------------------
//
// The buildStore function is module-private.  We re-import the module with
// doMock overrides so getRedisClient returns a Redis-like object.
// This verifies RedisStore is instantiated and sendCommand delegates to
// redis.call().
// ---------------------------------------------------------------------------

describe("rateLimit.ts - buildStore with Redis available", () => {
  it("should create a RedisStore with sendCommand that delegates to redis.call", async () => {
    // Track RedisStore constructor calls
    const redisStoreInstances: { sendCommand: unknown; prefix: string }[] = [];

    // Provide a fake redis client with a `call` method
    const mockRedisCall = vi.fn().mockResolvedValue(42);
    const fakeRedisClient = { call: mockRedisCall };

    // Override the mocks for this specific dynamic import.
    // doMock does not hoist and only affects subsequent dynamic imports.
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

    // rateLimit.ts also needs express-rate-limit and config/rateLimits.
    // express-rate-limit is already globally mocked.
    // config/rateLimits is also already globally mocked (includes authLogin + ai keys).

    // Import the module fresh -- triggers buildStore for each limiter
    const mod = await import("../rateLimit");

    // rateLimit.ts defines authLimiter and aiLimiter, each calling buildStore
    expect(redisStoreInstances.length).toBeGreaterThanOrEqual(2);

    // Verify sendCommand delegates to redis.call
    const { sendCommand, prefix } = redisStoreInstances[0];
    expect(prefix).toBeDefined();
    expect(typeof sendCommand).toBe("function");

    // Call sendCommand and verify it forwards to redis.call
    const result = await (sendCommand as (...args: string[]) => Promise<number>)(
      "INCR",
      "rl:auth:127.0.0.1"
    );
    expect(mockRedisCall).toHaveBeenCalledWith("INCR", "rl:auth:127.0.0.1");
    expect(result).toBe(42);

    // Verify the exports are still functions (middleware)
    expect(typeof mod.authLimiter).toBe("function");
    expect(typeof mod.aiLimiter).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 4 & 5  --  trustSafety.ts: getLimiter default branch & enforceAdminRateLimit 429
// ---------------------------------------------------------------------------

// For trustSafety tests we need separate mocks for its own dependencies.
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

// trustSafety uses createInMemoryRateLimiter from services/trustSafety --
// we import the real implementation since it's pure in-memory.
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

describe("trustSafety.ts - getLimiter default branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use the default limiter for an unknown action, allowing requests", async () => {
    // Pass an action string that does not match "checkin", "post", or "report"
    // so the switch falls through to the default case (lines 26-27).
    // The default returns checkInRateLimiter (windowMs: 60_000, max: 10).
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

    // Cast to any to pass an unrecognized action string and trigger the default branch
    await enforceTrustAction("unknown-action" as any)(req, res, next);

    // The default limiter should allow the first request
    expect(next).toHaveBeenCalled();
  });
});

describe("trustSafety.ts - enforceAdminRateLimit 429 path", () => {
  it("should return 429 when the admin rate limit is exceeded", () => {
    // The admin limiter allows 20 requests per 60s window.
    // We use the same key (userId) for all requests to exhaust the limit.
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

  it("should use req.ip as key when currentUser is absent", () => {
    const middleware = enforceAdminRateLimit();
    const { req, res, next } = createMockReqRes({ ip: "10.10.10.10" });
    // currentUser is null by default in createMockReqRes
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("should use 'unknown' as key when both currentUser and ip are absent", () => {
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
