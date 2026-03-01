/**
 * @fileoverview Unit tests for security middleware (middleware/security.ts)
 * @module server/__tests__/security-middleware.test
 *
 * Covers the exported middleware functions that are NOT exercised by the
 * existing security.test.ts (which targets server/security.ts utilities).
 *
 * Specifically tests:
 *  - validateHoneypot
 *  - validateEmail  (and the internal isValidEmail it delegates to)
 *  - validateUserAgent
 *  - logIPAddress
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Mocks – must be declared before the dynamic import of the module under test
// ---------------------------------------------------------------------------

// express-rate-limit: return a no-op middleware so the module-level rateLimit()
// calls don't blow up.  We are not testing rate limiters here.
vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  __esModule: true,
}));

// rate-limit-redis: provide a dummy RedisStore constructor
vi.mock("rate-limit-redis", () => ({
  RedisStore: class FakeRedisStore {
    constructor() {
      /* noop */
    }
  },
}));

// Redis client – not needed for the middleware tests
vi.mock("../../redis", () => ({
  getRedisClient: () => null,
}));

// Rate-limit configuration – supply minimal stubs so the module-level
// rateLimit() calls receive the shape they expect.
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
      mfaVerify: stub,
      sensitiveAuth: stub,
      remoteSkate: stub,
      postCreate: stub,
      analyticsIngest: stub,
      payment: stub,
      gameWrite: stub,
      trickmintUpload: stub,
      userSearch: stub,
    },
  };
});

// ---------------------------------------------------------------------------
// Import the module under test (after all mocks are registered)
// ---------------------------------------------------------------------------
const { validateHoneypot, validateEmail, validateUserAgent, logIPAddress } =
  await import("../../middleware/security");

// ---------------------------------------------------------------------------
// Helpers – minimal mock factories for Express req / res / next
// ---------------------------------------------------------------------------

function mockRequest(overrides: Record<string, unknown> = {}): Request {
  const headers: Record<string, string | string[] | undefined> = (overrides.headers ??
    {}) as Record<string, string | string[] | undefined>;

  const req: Partial<Request> = {
    body: (overrides.body ?? {}) as Record<string, unknown>,
    ip: (overrides.ip as string) ?? "127.0.0.1",
    headers: headers as Request["headers"],
    get: ((name: string) => {
      // Express's req.get() is case-insensitive
      const lower = name.toLowerCase();
      for (const [key, val] of Object.entries(headers)) {
        if (key.toLowerCase() === lower) return val;
      }
      return undefined;
    }) as Request["get"],
    connection: (overrides.connection ?? { remoteAddress: "10.0.0.1" }) as Request["connection"],
    socket: (overrides.socket ?? { remoteAddress: "10.0.0.2" }) as Request["socket"],
    currentUser: overrides.currentUser as Request["currentUser"],
    ...overrides,
  };

  return req as Request;
}

function mockResponse(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ===========================================================================
// validateHoneypot
// ===========================================================================

describe("validateHoneypot", () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = mockResponse();
    next = mockNext();
  });

  it("should call next() when the company field is empty string", () => {
    const req = mockRequest({ body: { company: "" } });
    validateHoneypot(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when the company field is whitespace-only", () => {
    const req = mockRequest({ body: { company: "   " } });
    validateHoneypot(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when there is no company field at all", () => {
    const req = mockRequest({ body: { email: "test@example.com" } });
    validateHoneypot(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when the body is empty", () => {
    const req = mockRequest({ body: {} });
    validateHoneypot(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should return 400 when the company field is filled (bot detected)", () => {
    const req = mockRequest({ body: { company: "Acme Corp" } });
    validateHoneypot(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid submission" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 for a single-character company value", () => {
    const req = mockRequest({ body: { company: "x" } });
    validateHoneypot(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// validateEmail
// ===========================================================================

describe("validateEmail", () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = mockResponse();
    next = mockNext();
  });

  // ---- Happy path --------------------------------------------------------

  it("should normalise a valid email to lowercase and call next()", () => {
    const req = mockRequest({ body: { email: "  Alice@Example.COM  " } });
    validateEmail(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.email).toBe("alice@example.com");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should accept a simple valid email", () => {
    const req = mockRequest({ body: { email: "user@domain.com" } });
    validateEmail(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.email).toBe("user@domain.com");
  });

  it("should accept email with dots in local part", () => {
    const req = mockRequest({ body: { email: "first.last@example.com" } });
    validateEmail(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should accept email with plus addressing", () => {
    const req = mockRequest({ body: { email: "user+tag@example.com" } });
    validateEmail(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should accept email with percent and hyphens", () => {
    const req = mockRequest({ body: { email: "user%name@sub-domain.example.com" } });
    validateEmail(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  // ---- Missing / wrong type ----------------------------------------------

  it("should return 400 when email is missing", () => {
    const req = mockRequest({ body: {} });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Email is required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 when email is null", () => {
    const req = mockRequest({ body: { email: null } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Email is required" });
  });

  it("should return 400 when email is a number", () => {
    const req = mockRequest({ body: { email: 12345 } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Email is required" });
  });

  it("should return 400 when email is an empty string", () => {
    const req = mockRequest({ body: { email: "" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Email is required" });
  });

  // ---- Invalid formats (exercises isValidEmail) --------------------------

  it("should reject email shorter than 3 characters", () => {
    const req = mockRequest({ body: { email: "a@" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject email without @ sign", () => {
    const req = mockRequest({ body: { email: "userdomain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with double @ sign", () => {
    const req = mockRequest({ body: { email: "user@@domain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email where domain has no dot", () => {
    const req = mockRequest({ body: { email: "user@localhost" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email where domain starts with a dot", () => {
    const req = mockRequest({ body: { email: "user@.domain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email where domain ends with a dot", () => {
    const req = mockRequest({ body: { email: "user@domain.com." } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email where local part starts with a dot", () => {
    const req = mockRequest({ body: { email: ".user@domain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email where local part ends with a dot", () => {
    const req = mockRequest({ body: { email: "user.@domain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with consecutive dots in local part", () => {
    const req = mockRequest({ body: { email: "user..name@domain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with a space", () => {
    const req = mockRequest({ body: { email: "user @domain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with domain label starting with hyphen", () => {
    const req = mockRequest({ body: { email: "user@-domain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with domain label ending with hyphen", () => {
    const req = mockRequest({ body: { email: "user@domain-.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email that exceeds 254 characters total", () => {
    const longLocal = "a".repeat(64);
    const longDomain = "b".repeat(185) + ".com"; // 64 + 1 + 189 = 254 -- at the boundary; push it over
    const tooLong = `${longLocal}@${"c".repeat(186)}.com`; // 64 + 1 + 190 = 255 > 254
    const req = mockRequest({ body: { email: tooLong } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email where local part exceeds 64 characters", () => {
    const longLocal = "a".repeat(65);
    const req = mockRequest({ body: { email: `${longLocal}@domain.com` } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with @ as first character", () => {
    const req = mockRequest({ body: { email: "@domain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with non-printable ASCII characters", () => {
    const req = mockRequest({ body: { email: "user\x01@domain.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with empty local part (user@ form triggers !domain false path)", () => {
    // "x@" has length 2, caught by length < 3. Use "xx@" instead — at=2, domain=""
    const req = mockRequest({ body: { email: "xx@" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with invalid characters in local part (line 426)", () => {
    const req = mockRequest({ body: { email: "user!name@example.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with special characters in domain (line 430)", () => {
    // $ is printable ASCII but not in [A-Za-z0-9-], so domain regex fails
    const req = mockRequest({ body: { email: "user@exam$ple.com" } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });

  it("should reject email with domain label exceeding 63 characters (line 431)", () => {
    const longLabel = "a".repeat(64);
    const req = mockRequest({ body: { email: `user@${longLabel}.com` } });
    validateEmail(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Please enter a valid email address" });
  });
});

// ===========================================================================
// validateUserAgent
// ===========================================================================

describe("validateUserAgent", () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = mockResponse();
    next = mockNext();
  });

  // ---- Valid user agents --------------------------------------------------

  it("should pass through a normal browser user agent", () => {
    const req = mockRequest({
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    validateUserAgent(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should pass through a mobile user agent", () => {
    const req = mockRequest({
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      },
    });
    validateUserAgent(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  // ---- Missing user agent -------------------------------------------------

  it("should return 400 when user agent header is missing", () => {
    const req = mockRequest({ headers: {} });
    validateUserAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid request" });
    expect(next).not.toHaveBeenCalled();
  });

  // ---- Bot patterns -------------------------------------------------------

  it("should block Googlebot", () => {
    const req = mockRequest({
      headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
    });
    validateUserAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Automated requests not allowed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should block crawler user agents", () => {
    const req = mockRequest({
      headers: { "user-agent": "MyCrawler/1.0" },
    });
    validateUserAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Automated requests not allowed" });
  });

  it("should block spider user agents", () => {
    const req = mockRequest({
      headers: { "user-agent": "Baiduspider/2.0" },
    });
    validateUserAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Automated requests not allowed" });
  });

  it("should block scraper user agents", () => {
    const req = mockRequest({
      headers: { "user-agent": "WebScraper/3.1" },
    });
    validateUserAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Automated requests not allowed" });
  });

  it("should block curl user agents", () => {
    const req = mockRequest({
      headers: { "user-agent": "curl/7.79.1" },
    });
    validateUserAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Automated requests not allowed" });
  });

  it("should block wget user agents", () => {
    const req = mockRequest({
      headers: { "user-agent": "Wget/1.21" },
    });
    validateUserAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Automated requests not allowed" });
  });

  it("should block python-requests user agents", () => {
    const req = mockRequest({
      headers: { "user-agent": "python-requests/2.28.0" },
    });
    validateUserAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Automated requests not allowed" });
  });

  it("should be case-insensitive when matching bot patterns", () => {
    const req = mockRequest({
      headers: { "user-agent": "PYTHON-REQUESTS/2.28.0" },
    });
    validateUserAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Automated requests not allowed" });
  });
});

// ===========================================================================
// logIPAddress
// ===========================================================================

describe("logIPAddress", () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = mockResponse();
    next = mockNext();
  });

  it("should use x-forwarded-for header when present", () => {
    const req = mockRequest({
      headers: { "x-forwarded-for": "203.0.113.50" },
    });
    logIPAddress(req, res, next);

    expect(req.clientIpAddress).toBe("203.0.113.50");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should use x-real-ip header when x-forwarded-for is absent", () => {
    const req = mockRequest({
      headers: { "x-real-ip": "198.51.100.14" },
    });
    logIPAddress(req, res, next);

    expect(req.clientIpAddress).toBe("198.51.100.14");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should prefer x-forwarded-for over x-real-ip", () => {
    const req = mockRequest({
      headers: {
        "x-forwarded-for": "203.0.113.50",
        "x-real-ip": "198.51.100.14",
      },
    });
    logIPAddress(req, res, next);

    expect(req.clientIpAddress).toBe("203.0.113.50");
  });

  it("should fall back to connection.remoteAddress", () => {
    const req = mockRequest({
      headers: {},
      connection: { remoteAddress: "10.10.10.10" },
      socket: { remoteAddress: "10.20.20.20" },
    });
    logIPAddress(req, res, next);

    expect(req.clientIpAddress).toBe("10.10.10.10");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should fall back to socket.remoteAddress when connection.remoteAddress is undefined", () => {
    const req = mockRequest({
      headers: {},
      connection: { remoteAddress: undefined },
      socket: { remoteAddress: "10.20.20.20" },
    });
    logIPAddress(req, res, next);

    expect(req.clientIpAddress).toBe("10.20.20.20");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should take first element when x-forwarded-for is an array", () => {
    const req = mockRequest({
      headers: { "x-forwarded-for": ["203.0.113.50", "198.51.100.14"] },
    });
    logIPAddress(req, res, next);

    expect(req.clientIpAddress).toBe("203.0.113.50");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should set ipAddress to undefined when no IP source is available", () => {
    const req = mockRequest({
      headers: {},
      connection: { remoteAddress: undefined },
      socket: { remoteAddress: undefined },
    });
    logIPAddress(req, res, next);

    expect(req.clientIpAddress).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should always call next() regardless of IP resolution", () => {
    const req = mockRequest({ headers: {} });
    logIPAddress(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
