/**
 * @fileoverview Coverage tests for uncovered lines in security middleware
 * @module server/__tests__/coverage-security-middleware.test
 *
 * Targets three specific uncovered code paths:
 *  1. buildStore() when Redis IS available (lines 16-18) — returns new RedisStore
 *  2. getDeviceFingerprint() returning x-session-id, x-client-fingerprint, and null (lines 57-63)
 *  3. userKeyGenerator() when all identifiers are fallback values (lines 75-81)
 *
 * Since getDeviceFingerprint and userKeyGenerator are not exported, they are
 * exercised indirectly via the rate limiter's keyGenerator option, which we
 * capture by mocking express-rate-limit.
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
// Redis branch (lines 16-18)
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
    emailSignup: { windowMs: 1000, max: 5, message: "test", prefix: "test:" },
    publicWrite: { windowMs: 1000, max: 30, message: "test", prefix: "pw:" },
    checkInIp: { windowMs: 1000, max: 10, message: "test", prefix: "ci:" },
    perUserSpotWrite: { windowMs: 1000, max: 30, message: "test", prefix: "pusw:" },
    perUserCheckIn: { windowMs: 1000, max: 10, message: "test", prefix: "puci:" },
    passwordReset: { windowMs: 1000, max: 3, message: "test", prefix: "pr:" },
    api: { windowMs: 1000, max: 100, message: "test", prefix: "api:" },
    usernameCheck: { windowMs: 1000, max: 20, message: "test", prefix: "uc:" },
    profileCreate: { windowMs: 1000, max: 5, message: "test", prefix: "pc:" },
    staticFile: { windowMs: 1000, max: 60, message: "test", prefix: "sf:" },
    quickMatch: { windowMs: 1000, max: 10, message: "test", prefix: "qm:" },
    spotRating: { windowMs: 1000, max: 10, message: "test", prefix: "sr:" },
    spotDiscovery: { windowMs: 1000, max: 20, message: "test", prefix: "sd:" },
    proAward: { windowMs: 1000, max: 5, message: "test", prefix: "pa:" },
    authLogin: { windowMs: 1000, max: 5, message: "test", prefix: "al:" },
    ai: { windowMs: 1000, max: 10, message: "test", prefix: "ai:" },
    profileRead: { windowMs: 1000, max: 60, message: "test", prefix: "prd:" },
    mfaVerify: { windowMs: 1000, max: 10, message: "test", prefix: "mfa:" },
    sensitiveAuth: { windowMs: 1000, max: 5, message: "test", prefix: "sa:" },
    remoteSkate: { windowMs: 1000, max: 10, message: "test", prefix: "rs:" },
    postCreate: { windowMs: 1000, max: 10, message: "test", prefix: "pcr:" },
    analyticsIngest: { windowMs: 1000, max: 60, message: "test", prefix: "ain:" },
    payment: { windowMs: 1000, max: 10, message: "test", prefix: "pay:" },
    gameWrite: { windowMs: 1000, max: 10, message: "test", prefix: "gw:" },
    trickmintUpload: { windowMs: 1000, max: 15, message: "test", prefix: "tu:" },
    userSearch: { windowMs: 1000, max: 30, message: "test", prefix: "us:" },
  },
}));

vi.mock("../../middleware/firebaseUid", () => ({
  FirebaseAuthedRequest: {},
}));

// ---------------------------------------------------------------------------
// Import the module under test — this triggers module-level code including
// buildStore() calls with our mocked Redis client
// ---------------------------------------------------------------------------
const _mod = await import("../../middleware/security");

// ---------------------------------------------------------------------------
// Find keyGenerator from a rate limiter that uses userKeyGenerator.
// perUserSpotWriteLimiter uses userKeyGenerator. We search capturedOptions
// for any entry that has a keyGenerator function.
// ---------------------------------------------------------------------------
function findKeyGenerator(): (req: any) => string {
  const withKeyGen = capturedOptions.find((opts) => typeof opts.keyGenerator === "function");
  if (!withKeyGen) throw new Error("No capturedOptions have a keyGenerator");
  return withKeyGen.keyGenerator;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createReq(overrides: any = {}): any {
  return {
    body: {},
    get: vi.fn(() => undefined),
    ip: "127.0.0.1",
    connection: { remoteAddress: "127.0.0.1" },
    socket: { remoteAddress: "127.0.0.1" },
    headers: {},
    currentUser: null,
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Security middleware — uncovered lines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // buildStore() with Redis available (lines 16-18)
  // =========================================================================
  describe("buildStore with Redis available", () => {
    it("should instantiate RedisStore when Redis client is available", () => {
      // buildStore is called once per rateLimit() invocation at module load time.
      // Since we mocked getRedisClient to return a truthy object, every
      // buildStore call should have created a RedisStore.
      expect(MockRedisStore.calls.length).toBeGreaterThan(0);

      // Verify it was called with the expected shape (prefix + sendCommand)
      const firstCall = MockRedisStore.calls[0];
      expect(firstCall).toHaveProperty("sendCommand");
      expect(firstCall).toHaveProperty("prefix");
      expect(typeof firstCall.sendCommand).toBe("function");
    });

    it("should pass a sendCommand that delegates to redis.call", async () => {
      // Get the sendCommand from the first RedisStore instantiation
      const firstCall = MockRedisStore.calls[0];
      const sendCommand = firstCall.sendCommand;

      // Replace mockRedisCall.fn with a spy for this test
      const callSpy = vi.fn().mockResolvedValue(1);
      mockRedisCall.fn = callSpy;

      const result = await sendCommand("SET", "key", "value");

      expect(callSpy).toHaveBeenCalledWith("SET", "key", "value");
      expect(result).toBe(1);
    });

    it("should use the correct prefix for each rate limiter store", () => {
      // All rateLimit() calls should have produced a store via buildStore,
      // so we expect RedisStore to have been called once per limiter.
      // security.ts has 15 rateLimit() calls.
      expect(MockRedisStore.calls.length).toBe(15);

      // Verify some known prefixes are present
      const prefixes = MockRedisStore.calls.map((c: any) => c.prefix);
      expect(prefixes).toContain("test:"); // emailSignup
      expect(prefixes).toContain("pw:"); // publicWrite
      expect(prefixes).toContain("pusw:"); // perUserSpotWrite
      expect(prefixes).toContain("puci:"); // perUserCheckIn
    });
  });

  // =========================================================================
  // getDeviceFingerprint — tested indirectly via keyGenerator (lines 57-63)
  // =========================================================================
  describe("getDeviceFingerprint via keyGenerator", () => {
    it("should return x-device-id when present (existing covered path)", () => {
      const keyGen = findKeyGenerator();
      const req = createReq({
        currentUser: { id: "user1" },
        ip: "1.2.3.4",
        get: vi.fn((header: string) => {
          if (header === "x-device-id") return "device-abc";
          return undefined;
        }),
      });

      const key = keyGen(req);
      expect(key).toBe("user1:device-abc:1.2.3.4");
    });

    it("should return x-session-id when x-device-id is absent (lines 57-58)", () => {
      const keyGen = findKeyGenerator();
      const req = createReq({
        currentUser: { id: "user2" },
        ip: "5.6.7.8",
        get: vi.fn((header: string) => {
          if (header === "x-session-id") return "session-xyz";
          return undefined;
        }),
      });

      const key = keyGen(req);
      expect(key).toBe("user2:session-xyz:5.6.7.8");
    });

    it("should return x-client-fingerprint when x-device-id and x-session-id are absent (lines 60-61)", () => {
      const keyGen = findKeyGenerator();
      const req = createReq({
        currentUser: { id: "user3" },
        ip: "9.10.11.12",
        get: vi.fn((header: string) => {
          if (header === "x-client-fingerprint") return "fp-12345";
          return undefined;
        }),
      });

      const key = keyGen(req);
      expect(key).toBe("user3:fp-12345:9.10.11.12");
    });

    it("should return null (unknown-device) when no device headers present (line 63)", () => {
      const keyGen = findKeyGenerator();
      const req = createReq({
        currentUser: { id: "user4" },
        ip: "13.14.15.16",
        get: vi.fn(() => undefined),
      });

      const key = keyGen(req);
      // device is null => falls back to "unknown-device"
      expect(key).toBe("user4:unknown-device:13.14.15.16");
    });
  });

  // =========================================================================
  // userKeyGenerator — all-fallback branch (lines 75-81)
  // =========================================================================
  describe("userKeyGenerator all-fallback branch", () => {
    it("should include extra headers when all identifiers are fallback values (lines 74-79)", () => {
      const keyGen = findKeyGenerator();
      const req = createReq({
        currentUser: null, // => "anonymous"
        ip: undefined, // => "unknown-ip"
        get: vi.fn((header: string) => {
          // No device headers => null => "unknown-device"
          // But return values for the extra headers in the fallback branch
          if (header === "user-agent") return "TestBrowser/1.0";
          if (header === "accept-language") return "en-US";
          if (header === "x-forwarded-for") return "10.0.0.1";
          return undefined;
        }),
      });

      const key = keyGen(req);
      expect(key).toBe("anonymous:unknown-device:unknown-ip:TestBrowser/1.0:en-US:10.0.0.1");
    });

    it("should use default values for extra headers when they are also missing", () => {
      const keyGen = findKeyGenerator();
      const req = createReq({
        currentUser: null, // => "anonymous"
        ip: undefined, // => "unknown-ip"
        get: vi.fn(() => undefined), // all headers return undefined
      });

      const key = keyGen(req);
      expect(key).toBe(
        "anonymous:unknown-device:unknown-ip:unknown-ua:unknown-lang:unknown-forwarded"
      );
    });

    it("should take the normal path when userId is present (not all fallbacks)", () => {
      const keyGen = findKeyGenerator();
      const req = createReq({
        currentUser: { id: "real-user" },
        ip: undefined, // => "unknown-ip"
        get: vi.fn(() => undefined), // => "unknown-device"
      });

      const key = keyGen(req);
      // Not all fallback => takes the normal return path (line 81)
      expect(key).toBe("real-user:unknown-device:unknown-ip");
    });

    it("should take the normal path when ip is present (not all fallbacks)", () => {
      const keyGen = findKeyGenerator();
      const req = createReq({
        currentUser: null, // => "anonymous"
        ip: "192.168.1.1", // NOT "unknown-ip"
        get: vi.fn(() => undefined), // => "unknown-device"
      });

      const key = keyGen(req);
      // Not all fallback => takes the normal return path (line 81)
      expect(key).toBe("anonymous:unknown-device:192.168.1.1");
    });

    it("should take the normal path when device is present (not all fallbacks)", () => {
      const keyGen = findKeyGenerator();
      const req = createReq({
        currentUser: null, // => "anonymous"
        ip: undefined, // => "unknown-ip"
        get: vi.fn((header: string) => {
          if (header === "x-device-id") return "device-123";
          return undefined;
        }),
      });

      const key = keyGen(req);
      // Not all fallback => takes the normal return path (line 81)
      expect(key).toBe("anonymous:device-123:unknown-ip");
    });
  });
});
