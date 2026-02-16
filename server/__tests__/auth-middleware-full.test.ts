/**
 * @fileoverview Comprehensive unit tests for auth/middleware.ts
 * @module server/__tests__/auth-middleware-full.test
 *
 * Tests all exported middleware and helper functions:
 *  - authenticateUser  (dev-admin bypass, session cookie, Firebase token, errors)
 *  - optionalAuthentication
 *  - requireEmailVerification
 *  - requireRecentAuth
 *  - recordRecentAuth / clearRecentAuth
 *  - requireAdmin
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Mocks — declared before the dynamic import of the module under test
// ---------------------------------------------------------------------------

const mockValidateSession = vi.fn();
const mockFindUserByFirebaseUid = vi.fn();

vi.mock("../auth/service", () => ({
  AuthService: {
    validateSession: (...args: unknown[]) => mockValidateSession(...args),
    findUserByFirebaseUid: (...args: unknown[]) => mockFindUserByFirebaseUid(...args),
  },
}));

const mockGetUser = vi.fn();
const mockVerifyIdToken = vi.fn();

vi.mock("../admin", () => ({
  admin: {
    auth: () => ({
      getUser: (...args: unknown[]) => mockGetUser(...args),
      verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
    }),
  },
}));

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
let mockRedisClient: Record<string, unknown> | null = null;

vi.mock("../redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are registered)
// ---------------------------------------------------------------------------

const {
  authenticateUser,
  optionalAuthentication,
  requireEmailVerification,
  requireRecentAuth,
  recordRecentAuth,
  clearRecentAuth,
  requireAdmin,
} = await import("../auth/middleware");

// ---------------------------------------------------------------------------
// Helpers — minimal Express mock factories
// ---------------------------------------------------------------------------

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    firebaseUid: "fb-uid-1",
    email: "user@example.com",
    passwordHash: "",
    firstName: "Test",
    lastName: "User",
    isActive: true,
    isEmailVerified: true,
    accountTier: "pro" as const,
    trustLevel: 50,
    roles: [] as string[],
    createdAt: new Date(),
    updatedAt: new Date(),
    pushToken: null,
    proAwardedBy: null,
    premiumPurchasedAt: null,
    emailVerificationToken: null,
    emailVerificationExpires: null,
    resetPasswordToken: null,
    resetPasswordExpires: null,
    lastLoginAt: new Date(),
    ...overrides,
  };
}

function mockRequest(overrides: Record<string, unknown> = {}): Request {
  const headers: Record<string, string | string[] | undefined> = (overrides.headers ??
    {}) as Record<string, string | string[] | undefined>;
  const req: Partial<Request> = {
    headers: headers as Request["headers"],
    cookies: (overrides.cookies ?? {}) as Record<string, string>,
    currentUser: overrides.currentUser as Request["currentUser"],
    get: ((name: string) => {
      const lower = name.toLowerCase();
      for (const [key, val] of Object.entries(headers)) {
        if (key.toLowerCase() === lower) return val;
      }
      return undefined;
    }) as Request["get"],
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

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisClient = null;
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

// ===========================================================================
// authenticateUser
// ===========================================================================

describe("authenticateUser", () => {
  // ---- Dev-admin bypass ---------------------------------------------------

  describe("dev-admin bypass", () => {
    it("should set a dev-admin currentUser and call next() when NODE_ENV is not production and x-dev-admin header is true", async () => {
      process.env.NODE_ENV = "test";
      const req = mockRequest({ headers: { "x-dev-admin": "true" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.currentUser).toBeDefined();
      expect(req.currentUser!.id).toBe("dev-admin-000");
      expect(req.currentUser!.email).toBe("admin@skatehubba.local");
      expect(req.currentUser!.isActive).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should NOT activate dev bypass when NODE_ENV is production", async () => {
      process.env.NODE_ENV = "production";
      const req = mockRequest({ headers: { "x-dev-admin": "true" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      // Should fall through to normal auth — no cookie or header means 401
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should NOT activate dev bypass when header value is not 'true'", async () => {
      process.env.NODE_ENV = "test";
      const req = mockRequest({ headers: { "x-dev-admin": "false" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ---- Session cookie auth ------------------------------------------------

  describe("session cookie auth", () => {
    it("should authenticate a valid session and attach currentUser with roles", async () => {
      const user = makeUser();
      mockValidateSession.mockResolvedValue(user);
      mockGetUser.mockResolvedValue({ customClaims: { admin: true } });

      const req = mockRequest({ cookies: { sessionToken: "valid-session" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(mockValidateSession).toHaveBeenCalledWith("valid-session");
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.currentUser).toBeDefined();
      expect(req.currentUser!.id).toBe("user-1");
      expect(req.currentUser!.roles).toContain("admin");
    });

    it("should authenticate session user without admin role when Firebase has no admin claim", async () => {
      const user = makeUser();
      mockValidateSession.mockResolvedValue(user);
      mockGetUser.mockResolvedValue({ customClaims: {} });

      const req = mockRequest({ cookies: { sessionToken: "valid-session" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.currentUser!.roles).not.toContain("admin");
    });

    it("should return 401 when validateSession returns null (invalid session)", async () => {
      mockValidateSession.mockResolvedValue(null);

      const req = mockRequest({ cookies: { sessionToken: "expired-session" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when session user is inactive", async () => {
      const user = makeUser({ isActive: false });
      mockValidateSession.mockResolvedValue(user);

      const req = mockRequest({ cookies: { sessionToken: "valid-session" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should still authenticate if Firebase getUser throws (ignores Firebase errors for roles)", async () => {
      const user = makeUser();
      mockValidateSession.mockResolvedValue(user);
      mockGetUser.mockRejectedValue(new Error("Firebase unavailable"));

      const req = mockRequest({ cookies: { sessionToken: "valid-session" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.currentUser!.roles).toEqual([]);
    });

    it("should fall through to Bearer token if session validation throws", async () => {
      mockValidateSession.mockRejectedValue(new Error("JWT malformed"));

      const req = mockRequest({
        cookies: { sessionToken: "bad-jwt" },
        headers: { authorization: "Bearer fb-token" },
      });
      const res = mockResponse();
      const next = mockNext();

      const user = makeUser({ firebaseUid: "fb-uid-2" });
      mockVerifyIdToken.mockResolvedValue({ uid: "fb-uid-2", admin: false });
      mockFindUserByFirebaseUid.mockResolvedValue(user);

      await authenticateUser(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.currentUser!.firebaseUid).toBe("fb-uid-2");
    });
  });

  // ---- Firebase token auth ------------------------------------------------

  describe("Firebase token auth", () => {
    it("should authenticate a valid Firebase token and attach currentUser", async () => {
      const user = makeUser({ firebaseUid: "fb-uid-3" });
      mockVerifyIdToken.mockResolvedValue({ uid: "fb-uid-3", admin: false });
      mockFindUserByFirebaseUid.mockResolvedValue(user);

      const req = mockRequest({ headers: { authorization: "Bearer valid-fb-token" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(mockVerifyIdToken).toHaveBeenCalledWith("valid-fb-token", true);
      expect(mockFindUserByFirebaseUid).toHaveBeenCalledWith("fb-uid-3");
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.currentUser!.id).toBe("user-1");
    });

    it("should include admin role when token has admin claim", async () => {
      const user = makeUser();
      mockVerifyIdToken.mockResolvedValue({ uid: "fb-uid-1", admin: true });
      mockFindUserByFirebaseUid.mockResolvedValue(user);

      const req = mockRequest({ headers: { authorization: "Bearer admin-token" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.currentUser!.roles).toContain("admin");
    });

    it("should return 401 when user not found by Firebase UID", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "unknown-uid" });
      mockFindUserByFirebaseUid.mockResolvedValue(null);

      const req = mockRequest({ headers: { authorization: "Bearer valid-token" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when Firebase user is inactive", async () => {
      const user = makeUser({ isActive: false });
      mockVerifyIdToken.mockResolvedValue({ uid: "fb-uid-1" });
      mockFindUserByFirebaseUid.mockResolvedValue(user);

      const req = mockRequest({ headers: { authorization: "Bearer valid-token" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when Firebase token verification fails", async () => {
      mockVerifyIdToken.mockRejectedValue(new Error("Token expired"));

      const req = mockRequest({ headers: { authorization: "Bearer expired-token" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ---- No auth provided ---------------------------------------------------

  describe("no auth provided", () => {
    it("should return 401 when there is no cookie and no Authorization header", async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when Authorization header has wrong scheme", async () => {
      const req = mockRequest({ headers: { authorization: "Basic abc123" } });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ---- Error handling (500) -----------------------------------------------

  describe("error handling", () => {
    it("should return 500 when an unexpected error is thrown at the top level", async () => {
      // Force an error by making the cookies accessor throw
      const req = mockRequest();
      Object.defineProperty(req, "cookies", {
        get() {
          throw new Error("Unexpected crash");
        },
      });
      const res = mockResponse();
      const next = mockNext();

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
      expect(next).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// optionalAuthentication
// ===========================================================================

describe("optionalAuthentication", () => {
  it("should set currentUser when a valid token is provided", async () => {
    const user = makeUser();
    mockVerifyIdToken.mockResolvedValue({ uid: "fb-uid-1", admin: true });
    mockFindUserByFirebaseUid.mockResolvedValue(user);

    const req = mockRequest({ headers: { authorization: "Bearer valid-token" } });
    const res = mockResponse();
    const next = mockNext();

    await optionalAuthentication(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.currentUser).toBeDefined();
    expect(req.currentUser!.id).toBe("user-1");
    expect(req.currentUser!.roles).toContain("admin");
  });

  it("should not set currentUser for inactive user", async () => {
    const user = makeUser({ isActive: false });
    mockVerifyIdToken.mockResolvedValue({ uid: "fb-uid-1" });
    mockFindUserByFirebaseUid.mockResolvedValue(user);

    const req = mockRequest({ headers: { authorization: "Bearer valid-token" } });
    const res = mockResponse();
    const next = mockNext();

    await optionalAuthentication(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.currentUser).toBeUndefined();
  });

  it("should continue without error when token is invalid", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

    const req = mockRequest({ headers: { authorization: "Bearer bad-token" } });
    const res = mockResponse();
    const next = mockNext();

    await optionalAuthentication(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.currentUser).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should continue without error when no Authorization header is present", async () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = mockNext();

    await optionalAuthentication(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.currentUser).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should continue when user is not found by Firebase UID", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "unknown-uid" });
    mockFindUserByFirebaseUid.mockResolvedValue(null);

    const req = mockRequest({ headers: { authorization: "Bearer some-token" } });
    const res = mockResponse();
    const next = mockNext();

    await optionalAuthentication(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.currentUser).toBeUndefined();
  });

  it("should ignore non-Bearer authorization schemes", async () => {
    const req = mockRequest({ headers: { authorization: "Basic abc123" } });
    const res = mockResponse();
    const next = mockNext();

    await optionalAuthentication(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.currentUser).toBeUndefined();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// requireEmailVerification
// ===========================================================================

describe("requireEmailVerification", () => {
  it("should return 401 when no currentUser is set", () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = mockNext();

    requireEmailVerification(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when user email is not verified", () => {
    const user = makeUser({ isEmailVerified: false });
    const req = mockRequest({ currentUser: user });
    const res = mockResponse();
    const next = mockNext();

    requireEmailVerification(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Email verification required",
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when user email is verified", () => {
    const user = makeUser({ isEmailVerified: true });
    const req = mockRequest({ currentUser: user });
    const res = mockResponse();
    const next = mockNext();

    requireEmailVerification(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// requireRecentAuth
// ===========================================================================

describe("requireRecentAuth", () => {
  it("should return 401 when no currentUser is set", async () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = mockNext();

    await requireRecentAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
    expect(next).not.toHaveBeenCalled();
  });

  describe("with Redis available", () => {
    beforeEach(() => {
      mockRedisClient = {
        get: mockRedisGet,
        set: mockRedisSet,
        del: mockRedisDel,
      };
    });

    it("should call next() when Redis has a recent auth record", async () => {
      mockRedisGet.mockResolvedValue(String(Date.now()));

      const user = makeUser();
      const req = mockRequest({ currentUser: user });
      const res = mockResponse();
      const next = mockNext();

      await requireRecentAuth(req, res, next);

      expect(mockRedisGet).toHaveBeenCalledWith("reauth:user-1");
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 403 when Redis has no recent auth record", async () => {
      mockRedisGet.mockResolvedValue(null);

      const user = makeUser();
      const req = mockRequest({ currentUser: user });
      const res = mockResponse();
      const next = mockNext();

      await requireRecentAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "REAUTH_REQUIRED",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("without Redis (fallback Map)", () => {
    beforeEach(() => {
      mockRedisClient = null;
    });

    it("should call next() when fallback map has recent auth within window", async () => {
      // First, record a recent auth to populate the fallback map
      recordRecentAuth("user-1");

      const user = makeUser();
      const req = mockRequest({ currentUser: user });
      const res = mockResponse();
      const next = mockNext();

      await requireRecentAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 403 when fallback map has no recent auth", async () => {
      // Ensure the user has no recent auth — clear first
      clearRecentAuth("user-1");

      const user = makeUser();
      const req = mockRequest({ currentUser: user });
      const res = mockResponse();
      const next = mockNext();

      await requireRecentAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "REAUTH_REQUIRED",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// recordRecentAuth / clearRecentAuth
// ===========================================================================

describe("recordRecentAuth", () => {
  it("should call redis.set with correct key and TTL when Redis is available", () => {
    mockRedisClient = {
      get: mockRedisGet,
      set: mockRedisSet,
      del: mockRedisDel,
    };

    recordRecentAuth("user-42");

    expect(mockRedisSet).toHaveBeenCalledTimes(1);
    const [key, _value, flag, ttl] = mockRedisSet.mock.calls[0];
    expect(key).toBe("reauth:user-42");
    expect(flag).toBe("EX");
    expect(ttl).toBe(300); // 5 minutes = 300 seconds
  });

  it("should use fallback Map when Redis is unavailable", () => {
    mockRedisClient = null;

    // Should not throw and should store the value
    recordRecentAuth("user-fallback");

    // Verify by checking that requireRecentAuth passes
    // (we tested the integration above)
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});

describe("clearRecentAuth", () => {
  it("should call redis.del with correct key when Redis is available", () => {
    mockRedisClient = {
      get: mockRedisGet,
      set: mockRedisSet,
      del: mockRedisDel,
    };

    clearRecentAuth("user-42");

    expect(mockRedisDel).toHaveBeenCalledWith("reauth:user-42");
  });

  it("should remove from fallback Map when Redis is unavailable", async () => {
    mockRedisClient = null;

    // Record then clear
    recordRecentAuth("user-clear-test");
    clearRecentAuth("user-clear-test");

    // Verify the auth is gone — requireRecentAuth should return 403
    const user = makeUser({ id: "user-clear-test" });
    const req = mockRequest({ currentUser: user });
    const res = mockResponse();
    const next = mockNext();

    await requireRecentAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// requireAdmin
// ===========================================================================

describe("requireAdmin", () => {
  it("should return 401 when no currentUser is set", async () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when token has admin: true claim", async () => {
    mockVerifyIdToken.mockResolvedValue({ admin: true });

    const user = makeUser();
    const req = mockRequest({
      currentUser: user,
      headers: { authorization: "Bearer admin-token" },
    });
    const res = mockResponse();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith("admin-token");
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when token has roles array containing admin", async () => {
    mockVerifyIdToken.mockResolvedValue({ admin: false, roles: ["admin", "moderator"] });

    const user = makeUser();
    const req = mockRequest({
      currentUser: user,
      headers: { authorization: "Bearer roles-token" },
    });
    const res = mockResponse();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should return 403 when token has no admin claim", async () => {
    mockVerifyIdToken.mockResolvedValue({ admin: false });

    const user = makeUser();
    const req = mockRequest({
      currentUser: user,
      headers: { authorization: "Bearer non-admin-token" },
    });
    const res = mockResponse();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when there is no Authorization header", async () => {
    const user = makeUser();
    const req = mockRequest({ currentUser: user });
    const res = mockResponse();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when token verification fails", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Token expired"));

    const user = makeUser();
    const req = mockRequest({
      currentUser: user,
      headers: { authorization: "Bearer bad-token" },
    });
    const res = mockResponse();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when Authorization scheme is not Bearer", async () => {
    const user = makeUser();
    const req = mockRequest({
      currentUser: user,
      headers: { authorization: "Basic abc123" },
    });
    const res = mockResponse();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
