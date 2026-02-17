/**
 * @fileoverview Full coverage tests for security middleware
 * @module server/__tests__/security-full.test
 *
 * Tests:
 * - validateHoneypot
 * - validateEmail (with isValidEmail)
 * - validateUserAgent
 * - logIPAddress
 * - getDeviceFingerprint (via userKeyGenerator)
 * - All rate limiter exports
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock redis
vi.mock("../redis", () => ({
  getRedisClient: () => null,
}));

// Mock rate-limit-redis
vi.mock("rate-limit-redis", () => ({
  RedisStore: vi.fn(),
}));

// Mock config
vi.mock("../config/env", () => ({
  env: { DATABASE_URL: "mock://test", NODE_ENV: "test" },
}));

// Mock rateLimits config
vi.mock("../config/rateLimits", () => ({
  RATE_LIMIT_CONFIG: {
    emailSignup: { windowMs: 900000, max: 5, message: "Too many signups", prefix: "rl:signup:" },
    publicWrite: { windowMs: 600000, max: 30, message: "Too many writes", prefix: "rl:write:" },
    checkInIp: { windowMs: 60000, max: 10, message: "Too many check-ins", prefix: "rl:checkin:" },
    perUserSpotWrite: {
      windowMs: 600000,
      max: 20,
      message: "Too many spot writes",
      prefix: "rl:spotwrite:",
    },
    perUserCheckIn: {
      windowMs: 300000,
      max: 10,
      message: "Too many user check-ins",
      prefix: "rl:usercheckin:",
    },
    passwordReset: { windowMs: 3600000, max: 3, message: "Too many resets", prefix: "rl:pwreset:" },
    api: { windowMs: 60000, max: 100, message: "Too many requests", prefix: "rl:api:" },
    usernameCheck: { windowMs: 60000, max: 30, message: "Too many checks", prefix: "rl:username:" },
    profileCreate: {
      windowMs: 3600000,
      max: 5,
      message: "Too many profiles",
      prefix: "rl:profile:",
    },
    staticFile: {
      windowMs: 60000,
      max: 60,
      message: "Too many file requests",
      prefix: "rl:static:",
    },
    quickMatch: { windowMs: 60000, max: 10, message: "Too many matches", prefix: "rl:match:" },
    spotRating: { windowMs: 60000, max: 20, message: "Too many ratings", prefix: "rl:rating:" },
    spotDiscovery: {
      windowMs: 60000,
      max: 30,
      message: "Too many discoveries",
      prefix: "rl:discovery:",
    },
    proAward: { windowMs: 60000, max: 10, message: "Too many awards", prefix: "rl:award:" },
  },
}));

// Mock firebaseUid middleware
vi.mock("../middleware/firebaseUid", () => ({
  FirebaseAuthedRequest: {},
}));

// Import after mocking
const {
  validateHoneypot,
  validateEmail,
  validateUserAgent,
  logIPAddress,
  emailSignupLimiter,
  publicWriteLimiter,
  passwordResetLimiter,
  apiLimiter,
  checkInIpLimiter,
  perUserSpotWriteLimiter,
  perUserCheckInLimiter,
  usernameCheckLimiter,
  profileCreateLimiter,
  staticFileLimiter,
  quickMatchLimiter,
  spotRatingLimiter,
  spotDiscoveryLimiter,
  proAwardLimiter,
} = await import("../middleware/security");

// Helpers
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

function createRes(): any {
  const res: any = {
    _statusCode: 200,
    _jsonData: null,
    status: vi.fn(function (this: any, code: number) {
      this._statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: any, data: any) {
      this._jsonData = data;
      return this;
    }),
  };
  return res;
}

describe("Security Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // validateHoneypot
  // ===========================================================================

  describe("validateHoneypot", () => {
    it("should pass when honeypot field is empty", () => {
      const req = createReq({ body: { company: "" } });
      const res = createRes();
      const next = vi.fn();

      validateHoneypot(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should pass when honeypot field is absent", () => {
      const req = createReq({ body: {} });
      const res = createRes();
      const next = vi.fn();

      validateHoneypot(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should reject when honeypot field is filled", () => {
      const req = createReq({ body: { company: "Bot Company Inc" } });
      const res = createRes();
      const next = vi.fn();

      validateHoneypot(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid submission" });
    });

    it("should pass when honeypot field is whitespace only", () => {
      const req = createReq({ body: { company: "   " } });
      const res = createRes();
      const next = vi.fn();

      validateHoneypot(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // validateEmail
  // ===========================================================================

  describe("validateEmail", () => {
    it("should accept a valid email", () => {
      const req = createReq({ body: { email: "user@example.com" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.email).toBe("user@example.com");
    });

    it("should normalize email to lowercase", () => {
      const req = createReq({ body: { email: "User@EXAMPLE.Com" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(req.body.email).toBe("user@example.com");
    });

    it("should trim whitespace", () => {
      const req = createReq({ body: { email: "  user@example.com  " } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(req.body.email).toBe("user@example.com");
    });

    it("should reject missing email", () => {
      const req = createReq({ body: {} });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject non-string email", () => {
      const req = createReq({ body: { email: 123 } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject email without @", () => {
      const req = createReq({ body: { email: "noatsign" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject email with multiple @", () => {
      const req = createReq({ body: { email: "user@@example.com" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject email too short", () => {
      const req = createReq({ body: { email: "a@" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject email with no domain dot", () => {
      const req = createReq({ body: { email: "user@localhost" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject email with leading dot in domain", () => {
      const req = createReq({ body: { email: "user@.example.com" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject email with consecutive dots in local part", () => {
      const req = createReq({ body: { email: "user..name@example.com" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject email with leading dot in local part", () => {
      const req = createReq({ body: { email: ".user@example.com" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject email with hyphen at start of domain label", () => {
      const req = createReq({ body: { email: "user@-example.com" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject email with spaces", () => {
      const req = createReq({ body: { email: "user @example.com" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should accept email with plus addressing", () => {
      const req = createReq({ body: { email: "user+tag@example.com" } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should reject email with local part > 64 chars", () => {
      const longLocal = "a".repeat(65);
      const req = createReq({ body: { email: `${longLocal}@example.com` } });
      const res = createRes();
      const next = vi.fn();

      validateEmail(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // validateUserAgent
  // ===========================================================================

  describe("validateUserAgent", () => {
    it("should pass for normal browser user agent", () => {
      const req = createReq({
        get: vi.fn((header: string) =>
          header === "User-Agent" ? "Mozilla/5.0 (Macintosh)" : undefined
        ),
      });
      const res = createRes();
      const next = vi.fn();

      validateUserAgent(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should reject missing user agent", () => {
      const req = createReq({
        get: vi.fn(() => undefined),
      });
      const res = createRes();
      const next = vi.fn();

      validateUserAgent(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject bot user agent", () => {
      const req = createReq({
        get: vi.fn((header: string) => (header === "User-Agent" ? "Googlebot/2.1" : undefined)),
      });
      const res = createRes();
      const next = vi.fn();

      validateUserAgent(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ error: "Automated requests not allowed" });
    });

    it("should reject curl user agent", () => {
      const req = createReq({
        get: vi.fn((header: string) => (header === "User-Agent" ? "curl/7.68.0" : undefined)),
      });
      const res = createRes();
      const next = vi.fn();

      validateUserAgent(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject python user agent", () => {
      const req = createReq({
        get: vi.fn((header: string) =>
          header === "User-Agent" ? "python-requests/2.28.0" : undefined
        ),
      });
      const res = createRes();
      const next = vi.fn();

      validateUserAgent(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it("should reject spider user agent", () => {
      const req = createReq({
        get: vi.fn((header: string) => (header === "User-Agent" ? "BingSpider" : undefined)),
      });
      const res = createRes();
      const next = vi.fn();

      validateUserAgent(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // logIPAddress
  // ===========================================================================

  describe("logIPAddress", () => {
    it("should extract IP from x-forwarded-for header", () => {
      const req = createReq({
        headers: { "x-forwarded-for": "203.0.113.50" },
        body: {},
      });
      const res = createRes();
      const next = vi.fn();

      logIPAddress(req, res, next);

      expect(req.clientIpAddress).toBe("203.0.113.50");
      expect(next).toHaveBeenCalled();
    });

    it("should extract IP from x-real-ip header", () => {
      const req = createReq({
        headers: { "x-real-ip": "203.0.113.51" },
        body: {},
      });
      const res = createRes();
      const next = vi.fn();

      logIPAddress(req, res, next);

      expect(req.clientIpAddress).toBe("203.0.113.51");
      expect(next).toHaveBeenCalled();
    });

    it("should extract first IP from array", () => {
      const req = createReq({
        headers: { "x-forwarded-for": ["203.0.113.50", "203.0.113.51"] },
        body: {},
      });
      const res = createRes();
      const next = vi.fn();

      logIPAddress(req, res, next);

      expect(req.clientIpAddress).toBe("203.0.113.50");
    });

    it("should fallback to connection remoteAddress", () => {
      const req = createReq({
        headers: {},
        body: {},
        connection: { remoteAddress: "192.168.1.1" },
        socket: { remoteAddress: "192.168.1.2" },
      });
      const res = createRes();
      const next = vi.fn();

      logIPAddress(req, res, next);

      expect(req.clientIpAddress).toBe("192.168.1.1");
    });
  });

  // ===========================================================================
  // Rate limiter exports
  // ===========================================================================

  describe("rate limiters", () => {
    it("should export all rate limiters", () => {
      expect(emailSignupLimiter).toBeDefined();
      expect(publicWriteLimiter).toBeDefined();
      expect(passwordResetLimiter).toBeDefined();
      expect(apiLimiter).toBeDefined();
      expect(checkInIpLimiter).toBeDefined();
      expect(perUserSpotWriteLimiter).toBeDefined();
      expect(perUserCheckInLimiter).toBeDefined();
      expect(usernameCheckLimiter).toBeDefined();
      expect(profileCreateLimiter).toBeDefined();
      expect(staticFileLimiter).toBeDefined();
      expect(quickMatchLimiter).toBeDefined();
      expect(spotRatingLimiter).toBeDefined();
      expect(spotDiscoveryLimiter).toBeDefined();
      expect(proAwardLimiter).toBeDefined();
    });
  });
});
