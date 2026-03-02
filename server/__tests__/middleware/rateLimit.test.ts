/**
 * @fileoverview Coverage tests for server/middleware/rateLimit.ts
 *
 * Covers:
 *  - buildStore() when Redis IS available — RedisStore instantiation
 *  - sendCommand delegates to redis.call (success path)
 *  - sendCommand returns 0 when redis.call throws (catch branch — line 23)
 *  - Rate limiter exports (authLimiter, aiLimiter)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted — declare mock references that survive vi.mock hoisting
// ---------------------------------------------------------------------------
const { capturedOptions, mockRedisCall, MockRedisStore } = vi.hoisted(() => {
  const capturedOptions: any[] = [];
  const mockRedisCall = { fn: (..._args: any[]) => Promise.resolve(0) as any };
  const MockRedisStore = { fn: null as any, calls: [] as any[] };
  return { capturedOptions, mockRedisCall, MockRedisStore };
});

// ---------------------------------------------------------------------------
// Mock express-rate-limit: capture options passed to each rateLimit() call
// ---------------------------------------------------------------------------
vi.mock("express-rate-limit", () => ({
  default: (opts: any) => {
    capturedOptions.push(opts);
    return (_req: any, _res: any, next: any) => next();
  },
}));

// ---------------------------------------------------------------------------
// Mock Redis client — return a real-looking object so buildStore takes the
// Redis branch
// ---------------------------------------------------------------------------
vi.mock("../../redis", () => ({
  getRedisClient: () => ({
    call: (...args: any[]) => mockRedisCall.fn(...args),
  }),
}));

// ---------------------------------------------------------------------------
// Mock RedisStore constructor — track instantiation and arguments
// ---------------------------------------------------------------------------
vi.mock("rate-limit-redis", () => {
  const Ctor = function (this: any, opts: any) {
    MockRedisStore.calls.push(opts);
  } as any;
  MockRedisStore.fn = Ctor;
  return { RedisStore: Ctor };
});

// ---------------------------------------------------------------------------
// Minimal env and rateLimits stubs
// ---------------------------------------------------------------------------
vi.mock("../../config/env", () => ({
  env: { DATABASE_URL: "mock://test", NODE_ENV: "test" },
}));

vi.mock("../../config/rateLimits", () => ({
  RATE_LIMIT_CONFIG: {
    authLogin: { windowMs: 1000, max: 5, message: "test", prefix: "al:" },
    ai: { windowMs: 1000, max: 10, message: "test", prefix: "ai:" },
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------
const { authLimiter, aiLimiter } = await import("../../middleware/rateLimit");

// ===========================================================================
// Tests
// ===========================================================================

describe("rateLimit middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rate limiter exports", () => {
    it("should export authLimiter", () => {
      expect(authLimiter).toBeDefined();
      expect(typeof authLimiter).toBe("function");
    });

    it("should export aiLimiter", () => {
      expect(aiLimiter).toBeDefined();
      expect(typeof aiLimiter).toBe("function");
    });
  });

  describe("buildStore with Redis available", () => {
    it("should instantiate RedisStore for each rate limiter", () => {
      // rateLimit.ts has 2 rateLimit() calls (authLimiter, aiLimiter)
      expect(MockRedisStore.calls.length).toBe(2);
    });

    it("should set the correct prefixes", () => {
      const prefixes = MockRedisStore.calls.map((c: any) => c.prefix);
      expect(prefixes).toContain("al:");
      expect(prefixes).toContain("ai:");
    });

    it("should pass a sendCommand that delegates to redis.call (success path)", async () => {
      const firstCall = MockRedisStore.calls[0];
      const sendCommand = firstCall.sendCommand;

      const callSpy = vi.fn().mockResolvedValue(42);
      mockRedisCall.fn = callSpy;

      const result = await sendCommand("INCR", "some-key");

      expect(callSpy).toHaveBeenCalledWith("INCR", "some-key");
      expect(result).toBe(42);
    });

    it("should return 999999 when redis.call throws (fail-closed — catch branch)", async () => {
      const firstCall = MockRedisStore.calls[0];
      const sendCommand = firstCall.sendCommand;

      // Make redis.call reject to trigger the catch branch
      mockRedisCall.fn = vi.fn().mockRejectedValue(new Error("Redis unreachable"));

      const result = await sendCommand("GET", "some-key");

      // Fail closed: return a high count so the rate limiter blocks the request
      expect(result).toBe(999999);
    });
  });
});
