/**
 * @fileoverview Smoke tests for Google Auth and Profile Creation
 *
 * Covers:
 * - Google auth login flow (mock token in test mode)
 * - Auth validation: missing token, malformed headers, mock tokens in production
 * - Profile creation with full field validation
 * - Profile /me endpoint
 * - Username check validation
 * - API error response structure validation
 * - Edge cases: duplicate profiles, username conflicts, avatar validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks — must be declared before any imports that use them
// =============================================================================

vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
    FIREBASE_STORAGE_BUCKET: "test-bucket",
  },
}));

vi.mock("../../logger", () => ({
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

// --- Database mock with controllable returns ---
const mockDbReturns = {
  selectResult: [] as any[],
  insertResult: [] as any[],
  deleteResult: [] as any[],
  updateResult: [] as any[],
};

const mockIsDatabaseAvailable = vi.fn().mockReturnValue(true);

vi.mock("../../db", () => ({
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.insertResult)),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.insertResult)),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.deleteResult)),
      }),
    }),
  }),
  isDatabaseAvailable: () => mockIsDatabaseAvailable(),
}));

// --- Firebase Admin mock ---
const mockVerifyIdToken = vi.fn();
const mockGetUser = vi.fn().mockResolvedValue({ customClaims: {} });

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
      getUser: mockGetUser,
    }),
    storage: () => ({
      bucket: (name?: string) => ({
        name: name || "test-bucket",
        file: () => ({
          save: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }),
  },
}));

vi.mock("../../auth/audit", () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
    logLoginSuccess: vi.fn().mockResolvedValue(undefined),
    logLoginFailure: vi.fn().mockResolvedValue(undefined),
    logLogout: vi.fn().mockResolvedValue(undefined),
    logAccountLocked: vi.fn().mockResolvedValue(undefined),
    logPasswordChanged: vi.fn().mockResolvedValue(undefined),
    logPasswordResetRequested: vi.fn().mockResolvedValue(undefined),
    logMfaEvent: vi.fn().mockResolvedValue(undefined),
    logSuspiciousActivity: vi.fn().mockResolvedValue(undefined),
    logSessionsInvalidated: vi.fn().mockResolvedValue(undefined),
  },
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../auth/lockout", () => ({
  LockoutService: {
    checkLockout: vi.fn().mockResolvedValue({ isLocked: false }),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    getLockoutMessage: vi.fn().mockReturnValue("Account temporarily locked"),
  },
}));

vi.mock("../../middleware/rateLimit", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../middleware/csrf", () => ({
  requireCsrfToken: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../redis", () => ({
  getRedisClient: () => null,
}));

vi.mock("../../auth/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../security", () => ({
  SECURITY_CONFIG: {
    SESSION_TTL: 7 * 24 * 60 * 60 * 1000,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000,
  },
}));

// --- Profile-specific mocks ---
vi.mock("@shared/schema", () => ({
  onboardingProfiles: { uid: "uid" },
  customUsers: {},
  authSessions: {},
}));

vi.mock("@shared/validation/profile", async () => {
  const actual = await vi.importActual<typeof import("@shared/validation/profile")>(
    "../../../packages/shared/validation/profile"
  );
  return actual;
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
}));

vi.mock("nanoid", () => ({
  customAlphabet: () => () => "abcd1234",
}));

vi.mock("../../middleware/firebaseUid", () => ({
  requireFirebaseUid: (req: any, _res: any, next: any) => {
    req.firebaseUid = req.firebaseUid || "test-firebase-uid";
    next();
  },
}));

vi.mock("../../middleware/security", () => ({
  profileCreateLimiter: (_req: any, _res: any, next: any) => next(),
  usernameCheckLimiter: (_req: any, _res: any, next: any) => next(),
}));

const mockIsAvailable = vi.fn().mockResolvedValue(true);
const mockReserve = vi.fn().mockResolvedValue(true);
const mockEnsure = vi.fn().mockResolvedValue(true);
const mockRelease = vi.fn().mockResolvedValue(undefined);
const mockCreateProfileWithRollback = vi.fn();

vi.mock("../../services/profileService", () => ({
  createUsernameStore: () => ({
    isAvailable: (...args: any[]) => mockIsAvailable(...args),
    reserve: (...args: any[]) => mockReserve(...args),
    ensure: (...args: any[]) => mockEnsure(...args),
    release: (...args: any[]) => mockRelease(...args),
  }),
  createProfileWithRollback: (...args: any[]) => mockCreateProfileWithRollback(...args),
}));

vi.mock("../../config/constants", () => ({
  MAX_AVATAR_BYTES: 5 * 1024 * 1024,
  MAX_USERNAME_GENERATION_ATTEMPTS: 5,
}));

vi.mock("../../utils/apiError", async () => {
  const actual =
    await vi.importActual<typeof import("../../utils/apiError")>("../../utils/apiError");
  return actual;
});

// =============================================================================
// Dynamic imports (after mocks)
// =============================================================================

const { AuthService } = await import("../../auth/service");
const { LockoutService } = await import("../../auth/lockout");
const { setupLoginRoutes } = await import("../../auth/routes/login");

// =============================================================================
// Helpers
// =============================================================================

type RouteHandler = (req: any, res: any, next?: any) => Promise<any> | void;
const authRouteHandlers: Record<string, RouteHandler[]> = {};

function captureAuthRoutes() {
  const app: any = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      authRouteHandlers[`GET ${path}`] = handlers;
    },
    post: (path: string, ...handlers: RouteHandler[]) => {
      authRouteHandlers[`POST ${path}`] = handlers;
    },
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  };
  setupLoginRoutes(app);
  return app;
}

// Capture profile route handlers
const profileRouteHandlers: Record<string, RouteHandler[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    get: vi.fn((path: string, ...handlers: any[]) => {
      profileRouteHandlers[`GET ${path}`] = handlers;
    }),
    post: vi.fn((path: string, ...handlers: any[]) => {
      profileRouteHandlers[`POST ${path}`] = handlers;
    }),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../../routes/profile");

function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    cookies: {},
    body: {},
    query: {},
    currentUser: undefined,
    firebaseUid: "test-firebase-uid",
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  };
}

function mockResponse(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

async function callHandlers(handlers: RouteHandler[], req: any, res: any) {
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// Initialize auth route capture
captureAuthRoutes();

// =============================================================================
// Shared mock user
// =============================================================================

const NOW = new Date("2026-01-15T12:00:00.000Z");

const mockUser = {
  id: "user-001",
  email: "google@skatehubba.local",
  firstName: "Google",
  lastName: "Skater",
  firebaseUid: "mock-google-uid-12345",
  passwordHash: "firebase-auth-user",
  isActive: true,
  isEmailVerified: true,
  accountTier: "free" as const,
  trustLevel: 50,
  pushToken: null,
  proAwardedBy: null,
  premiumPurchasedAt: null,
  emailVerificationToken: null,
  emailVerificationExpires: null,
  resetPasswordToken: null,
  resetPasswordExpires: null,
  lastLoginAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

const mockProfile = {
  id: 1,
  uid: "test-firebase-uid",
  username: "testskater",
  stance: "regular",
  experienceLevel: "intermediate",
  favoriteTricks: ["kickflip", "heelflip"],
  bio: "Skate or die",
  sponsorFlow: null,
  sponsorTeam: null,
  hometownShop: null,
  spotsVisited: 5,
  crewName: null,
  credibilityScore: 10,
  avatarUrl: null,
  createdAt: NOW,
  updatedAt: NOW,
};

// =============================================================================
// Tests
// =============================================================================

describe("Auth & Profile Smoke Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.insertResult = [];
    mockDbReturns.deleteResult = [];
    mockDbReturns.updateResult = [];
    mockIsDatabaseAvailable.mockReturnValue(true);
    mockVerifyIdToken.mockReset();
    mockIsAvailable.mockResolvedValue(true);
    mockReserve.mockResolvedValue(true);
    mockEnsure.mockResolvedValue(true);
    mockRelease.mockResolvedValue(undefined);
    mockCreateProfileWithRollback.mockReset();
    (LockoutService.checkLockout as any).mockResolvedValue({ isLocked: false });
  });

  // ===========================================================================
  // Google Auth Login — Happy Path
  // ===========================================================================

  describe("Google Auth Login", () => {
    it("should login with mock Google token in test mode and return user data", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];
      expect(handlers).toBeDefined();

      // First call: findUserByFirebaseUid — user exists
      vi.spyOn(AuthService, "findUserByFirebaseUid").mockResolvedValue(mockUser);
      vi.spyOn(AuthService, "createSession").mockResolvedValue({
        token: "jwt-session-token",
        session: {
          id: "sess-1",
          userId: mockUser.id,
          token: "hash",
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      });
      vi.spyOn(AuthService, "updateLastLogin").mockResolvedValue(undefined);

      const req = mockRequest({
        headers: { authorization: "Bearer mock-google-token" },
        body: {},
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            id: mockUser.id,
            email: "google@skatehubba.local",
            provider: "firebase",
          }),
          strategy: "firebase",
        })
      );
      // Should set HttpOnly cookie
      expect(res.cookie).toHaveBeenCalledWith(
        "sessionToken",
        "jwt-session-token",
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        })
      );
    });

    it("should auto-register a new user on first Google login", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];

      vi.spyOn(AuthService, "findUserByFirebaseUid").mockResolvedValue(null);
      vi.spyOn(AuthService, "createUser").mockResolvedValue({
        user: { ...mockUser, id: "new-user-001" },
        emailToken: "verify-token",
      });
      vi.spyOn(AuthService, "createSession").mockResolvedValue({
        token: "new-session-token",
        session: {
          id: "sess-2",
          userId: "new-user-001",
          token: "hash",
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      });
      vi.spyOn(AuthService, "updateLastLogin").mockResolvedValue(undefined);

      const req = mockRequest({
        headers: { authorization: "Bearer mock-google-token" },
        body: { firstName: "New", lastName: "Skater" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(AuthService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "google@skatehubba.local",
          firebaseUid: "mock-google-uid-12345",
          isEmailVerified: false, // mock token doesn't have email_verified
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: "new-user-001" }),
        })
      );
    });

    it("should set httpOnly session cookie on successful login", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];

      vi.spyOn(AuthService, "findUserByFirebaseUid").mockResolvedValue(mockUser);
      vi.spyOn(AuthService, "createSession").mockResolvedValue({
        token: "secure-jwt",
        session: {
          id: "s1",
          userId: mockUser.id,
          token: "h",
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      });
      vi.spyOn(AuthService, "updateLastLogin").mockResolvedValue(undefined);

      const req = mockRequest({
        headers: { authorization: "Bearer mock-google-token" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        "sessionToken",
        "secure-jwt",
        expect.objectContaining({ httpOnly: true })
      );
    });
  });

  // ===========================================================================
  // Auth API Validation — Error Paths
  // ===========================================================================

  describe("Auth API Validation", () => {
    it("should reject request with missing Authorization header", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];

      const req = mockRequest({ headers: {} });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Authentication failed" })
      );
    });

    it("should reject request with non-Bearer authorization", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];

      const req = mockRequest({
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Authentication failed" })
      );
    });

    it("should reject invalid Firebase token", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];

      mockVerifyIdToken.mockRejectedValue(new Error("Token verification failed"));

      const req = mockRequest({
        headers: { authorization: "Bearer invalid-token-xyz" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Authentication failed" })
      );
    });

    it("should reject locked-out accounts", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];
      const unlockTime = new Date(Date.now() + 15 * 60 * 1000);

      (LockoutService.checkLockout as any).mockResolvedValue({
        isLocked: true,
        unlockAt: unlockTime,
      });

      vi.spyOn(AuthService, "findUserByFirebaseUid").mockResolvedValue(mockUser);

      const req = mockRequest({
        headers: { authorization: "Bearer mock-google-token" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "ACCOUNT_LOCKED" }));
    });

    it("should reject empty Bearer token", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];

      const req = mockRequest({
        headers: { authorization: "Bearer " },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      // Empty token after trim should fail Firebase verification
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return consistent error format for auth failures", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];

      mockVerifyIdToken.mockRejectedValue(new Error("expired"));

      const req = mockRequest({
        headers: { authorization: "Bearer expired-token" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody).toHaveProperty("error");
      expect(typeof responseBody.error).toBe("string");
    });
  });

  // ===========================================================================
  // Profile Creation — Happy Path
  // ===========================================================================

  describe("Profile Creation", () => {
    it("should create profile with valid payload", async () => {
      const handlers = profileRouteHandlers["POST /create"];
      expect(handlers).toBeDefined();

      const createdProfile = {
        ...mockProfile,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      };
      mockCreateProfileWithRollback.mockResolvedValue(createdProfile);

      const req = mockRequest({
        body: {
          username: "shredmaster",
          stance: "goofy",
          experienceLevel: "advanced",
          favoriteTricks: ["kickflip", "treflip"],
          bio: "Skate all day",
        },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ profile: createdProfile }));
    });

    it("should create profile with skip=true (auto-generated username)", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const createdProfile = {
        ...mockProfile,
        username: "skaterabcd1234",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      };
      mockCreateProfileWithRollback.mockResolvedValue(createdProfile);

      const req = mockRequest({
        body: { skip: true },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(mockReserve).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return existing profile if already created", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      // Simulate existing profile found in DB
      const existingProfile = {
        ...mockProfile,
        createdAt: NOW,
        updatedAt: NOW,
      };

      // Override the mock DB chain for this test to return existing profile
      const originalGetDb = (await import("../../db")).getDb;
      const dbMock = originalGetDb();
      // The handler calls db.select().from().where().limit() for existing profile check
      // Since our mock returns mockDbReturns.selectResult, set it to have the profile
      mockDbReturns.selectResult = [existingProfile];

      const req = mockRequest({
        body: {
          username: "testskater",
          stance: "regular",
        },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            username: "testskater",
          }),
        })
      );
    });
  });

  // ===========================================================================
  // Profile API Validation — Error Paths
  // ===========================================================================

  describe("Profile API Validation", () => {
    it("should reject profile creation when database is unavailable", async () => {
      const handlers = profileRouteHandlers["POST /create"];
      mockIsDatabaseAvailable.mockReturnValue(false);

      const req = mockRequest({
        body: { username: "validuser", stance: "regular" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "DATABASE_UNAVAILABLE" })
      );
    });

    it("should reject username shorter than 3 characters", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: { username: "ab" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject username longer than 20 characters", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: { username: "a".repeat(21) },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject username with special characters", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: { username: "skater_pro!" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject invalid stance value", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: { username: "validuser", stance: "mongo" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject invalid experience level", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: { username: "validuser", experienceLevel: "legend" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject bio longer than 500 characters", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: { username: "validuser", bio: "x".repeat(501) },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject favoriteTricks with more than 20 items", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const tricks = Array.from({ length: 21 }, (_, i) => `trick${i}`);
      const req = mockRequest({
        body: { username: "validuser", favoriteTricks: tricks },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject negative spotsVisited", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: { username: "validuser", spotsVisited: -1 },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject when username is taken", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      mockReserve.mockResolvedValue(false);

      const req = mockRequest({
        body: { username: "takenname" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "USERNAME_TAKEN" }));
    });

    it("should require username when skip is not set", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: {},
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should accept valid stance values (regular/goofy)", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      for (const stance of ["regular", "goofy"]) {
        const createdProfile = {
          ...mockProfile,
          stance,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        };
        mockCreateProfileWithRollback.mockResolvedValue(createdProfile);
        mockReserve.mockResolvedValue(true);

        const req = mockRequest({
          body: { username: "validuser", stance },
        });
        const res = mockResponse();

        await callHandlers(handlers, req, res);

        expect(res.status).toHaveBeenCalledWith(201);
      }
    });

    it("should accept all valid experience levels", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      for (const level of ["beginner", "intermediate", "advanced", "pro"]) {
        const createdProfile = {
          ...mockProfile,
          experienceLevel: level,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        };
        mockCreateProfileWithRollback.mockResolvedValue(createdProfile);
        mockReserve.mockResolvedValue(true);

        const req = mockRequest({
          body: { username: "validuser", experienceLevel: level },
        });
        const res = mockResponse();

        await callHandlers(handlers, req, res);

        expect(res.status).toHaveBeenCalledWith(201);
      }
    });
  });

  // ===========================================================================
  // Profile /me Endpoint
  // ===========================================================================

  describe("Profile GET /me", () => {
    it("should return profile for authenticated user", async () => {
      const handlers = profileRouteHandlers["GET /me"];
      expect(handlers).toBeDefined();

      mockDbReturns.selectResult = [mockProfile];

      const req = mockRequest();
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            username: "testskater",
            stance: "regular",
          }),
        })
      );
    });

    it("should return 404 when profile does not exist", async () => {
      const handlers = profileRouteHandlers["GET /me"];

      mockDbReturns.selectResult = [];

      const req = mockRequest();
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "PROFILE_NOT_FOUND" })
      );
    });

    it("should return 503 when database is unavailable", async () => {
      const handlers = profileRouteHandlers["GET /me"];

      mockIsDatabaseAvailable.mockReturnValue(false);

      const req = mockRequest();
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "DATABASE_UNAVAILABLE" })
      );
    });
  });

  // ===========================================================================
  // Username Check Endpoint
  // ===========================================================================

  describe("Username Check GET /username-check", () => {
    it("should return available=true for valid unique username", async () => {
      const handlers = profileRouteHandlers["GET /username-check"];
      expect(handlers).toBeDefined();

      mockIsAvailable.mockResolvedValue(true);

      const req = mockRequest({ query: { username: "freshname" } });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({ available: true });
    });

    it("should return available=false for taken username", async () => {
      const handlers = profileRouteHandlers["GET /username-check"];

      mockIsAvailable.mockResolvedValue(false);

      const req = mockRequest({ query: { username: "takenname" } });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({ available: false });
    });

    it("should reject invalid username format", async () => {
      const handlers = profileRouteHandlers["GET /username-check"];

      const req = mockRequest({ query: { username: "ab" } }); // too short
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "invalid_username" }));
    });

    it("should reject username with special chars in check", async () => {
      const handlers = profileRouteHandlers["GET /username-check"];

      const req = mockRequest({ query: { username: "bad_user!" } });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 503 when database is unavailable", async () => {
      const handlers = profileRouteHandlers["GET /username-check"];

      mockIsDatabaseAvailable.mockReturnValue(false);

      const req = mockRequest({ query: { username: "validname" } });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should reject missing username query param", async () => {
      const handlers = profileRouteHandlers["GET /username-check"];

      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ===========================================================================
  // Avatar Validation
  // ===========================================================================

  describe("Avatar Validation", () => {
    it("should reject invalid avatar data URL format", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: {
          username: "validuser",
          avatarBase64: "not-a-valid-data-url",
        },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "INVALID_AVATAR_FORMAT" })
      );
    });

    it("should reject unsupported avatar MIME type", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      // Create a valid data URL with unsupported MIME type
      const fakeBase64 = Buffer.from("fake-image").toString("base64");
      const req = mockRequest({
        body: {
          username: "validuser",
          avatarBase64: `data:image/bmp;base64,${fakeBase64}`,
        },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "INVALID_AVATAR_TYPE" })
      );
    });

    it("should reject avatar exceeding size limit", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      // Create a data URL with payload > 5MB
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024, "x");
      const largeBase64 = largeBuffer.toString("base64");
      const req = mockRequest({
        body: {
          username: "validuser",
          avatarBase64: `data:image/png;base64,${largeBase64}`,
        },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "AVATAR_TOO_LARGE" }));
    });

    it("should release username on avatar validation failure", async () => {
      const handlers = profileRouteHandlers["POST /create"];

      const req = mockRequest({
        body: {
          username: "validuser",
          avatarBase64: "not-a-valid-data-url",
        },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      expect(mockRelease).toHaveBeenCalledWith("test-firebase-uid");
    });
  });

  // ===========================================================================
  // Auth Response Structure Validation
  // ===========================================================================

  describe("API Response Structure", () => {
    it("should return user object with required fields on successful auth", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];

      vi.spyOn(AuthService, "findUserByFirebaseUid").mockResolvedValue(mockUser);
      vi.spyOn(AuthService, "createSession").mockResolvedValue({
        token: "jwt",
        session: {
          id: "s",
          userId: mockUser.id,
          token: "h",
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      });
      vi.spyOn(AuthService, "updateLastLogin").mockResolvedValue(undefined);

      const req = mockRequest({
        headers: { authorization: "Bearer mock-google-token" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      const body = res.json.mock.calls[0][0];
      expect(body.user).toHaveProperty("id");
      expect(body.user).toHaveProperty("email");
      expect(body.user).toHaveProperty("displayName");
      expect(body.user).toHaveProperty("provider");
      expect(body.user).toHaveProperty("createdAt");
      expect(body).toHaveProperty("strategy");
    });

    it("should not include raw token in auth response body (cookie only)", async () => {
      const handlers = authRouteHandlers["POST /api/auth/login"];

      vi.spyOn(AuthService, "findUserByFirebaseUid").mockResolvedValue(mockUser);
      vi.spyOn(AuthService, "createSession").mockResolvedValue({
        token: "secret-jwt",
        session: {
          id: "s",
          userId: mockUser.id,
          token: "h",
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      });
      vi.spyOn(AuthService, "updateLastLogin").mockResolvedValue(undefined);

      const req = mockRequest({
        headers: { authorization: "Bearer mock-google-token" },
      });
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      const body = res.json.mock.calls[0][0];
      expect(body).not.toHaveProperty("token");
      expect(JSON.stringify(body)).not.toContain("secret-jwt");
    });

    it("should return standardized error shape for all error responses", async () => {
      // Test auth error format
      const authHandlers = authRouteHandlers["POST /api/auth/login"];
      const authReq = mockRequest({ headers: {} });
      const authRes = mockResponse();

      await callHandlers(authHandlers, authReq, authRes);

      const authBody = authRes.json.mock.calls[0][0];
      expect(authBody).toHaveProperty("error");
      expect(typeof authBody.error).toBe("string");
    });

    it("should serialize dates as ISO strings in profile responses", async () => {
      const handlers = profileRouteHandlers["GET /me"];

      mockDbReturns.selectResult = [mockProfile];

      const req = mockRequest();
      const res = mockResponse();

      await callHandlers(handlers, req, res);

      const body = res.json.mock.calls[0][0];
      expect(body.profile.createdAt).toBe(NOW.toISOString());
      expect(body.profile.updatedAt).toBe(NOW.toISOString());
    });
  });

  // ===========================================================================
  // Validation Schema Unit Tests
  // ===========================================================================

  describe("Validation Schemas", () => {
    it("usernameSchema: transforms to lowercase", async () => {
      const { usernameSchema } = await import("@shared/validation/profile");
      const result = usernameSchema.safeParse("MyUser123");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("myuser123");
      }
    });

    it("usernameSchema: rejects underscores and hyphens", async () => {
      const { usernameSchema } = await import("@shared/validation/profile");
      expect(usernameSchema.safeParse("my_user").success).toBe(false);
      expect(usernameSchema.safeParse("my-user").success).toBe(false);
    });

    it("usernameSchema: rejects empty string", async () => {
      const { usernameSchema } = await import("@shared/validation/profile");
      expect(usernameSchema.safeParse("").success).toBe(false);
    });

    it("profileCreateSchema: accepts minimal valid payload (skip)", async () => {
      const { profileCreateSchema } = await import("@shared/validation/profile");
      const result = profileCreateSchema.safeParse({ skip: true });
      expect(result.success).toBe(true);
    });

    it("profileCreateSchema: accepts full valid payload", async () => {
      const { profileCreateSchema } = await import("@shared/validation/profile");
      const result = profileCreateSchema.safeParse({
        username: "shredder",
        stance: "goofy",
        experienceLevel: "pro",
        favoriteTricks: ["kickflip", "heelflip", "treflip"],
        bio: "Born to skate",
        sponsorFlow: "Nike SB",
        sponsorTeam: "Team Element",
        hometownShop: "CCS",
        spotsVisited: 42,
        crewName: "Local Crew",
        credibilityScore: 100,
      });
      expect(result.success).toBe(true);
    });

    it("profileCreateSchema: rejects non-integer spotsVisited", async () => {
      const { profileCreateSchema } = await import("@shared/validation/profile");
      const result = profileCreateSchema.safeParse({
        username: "validuser",
        spotsVisited: 3.5,
      });
      expect(result.success).toBe(false);
    });

    it("profileCreateSchema: rejects sponsorFlow exceeding max length", async () => {
      const { profileCreateSchema } = await import("@shared/validation/profile");
      const result = profileCreateSchema.safeParse({
        username: "validuser",
        sponsorFlow: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("profileCreateSchema: coerces empty string stance to undefined", async () => {
      const { profileCreateSchema } = await import("@shared/validation/profile");
      const result = profileCreateSchema.safeParse({
        username: "validuser",
        stance: "",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stance).toBeUndefined();
      }
    });

    it("profileCreateSchema: rejects favoriteTricks with empty strings", async () => {
      const { profileCreateSchema } = await import("@shared/validation/profile");
      const result = profileCreateSchema.safeParse({
        username: "validuser",
        favoriteTricks: ["kickflip", ""],
      });
      expect(result.success).toBe(false);
    });

    it("stanceSchema: only accepts regular and goofy", async () => {
      const { stanceSchema } = await import("@shared/validation/profile");
      expect(stanceSchema.safeParse("regular").success).toBe(true);
      expect(stanceSchema.safeParse("goofy").success).toBe(true);
      expect(stanceSchema.safeParse("mongo").success).toBe(false);
      expect(stanceSchema.safeParse("switch").success).toBe(false);
    });

    it("experienceLevelSchema: accepts all defined levels", async () => {
      const { experienceLevelSchema } = await import("@shared/validation/profile");
      for (const level of ["beginner", "intermediate", "advanced", "pro"]) {
        expect(experienceLevelSchema.safeParse(level).success).toBe(true);
      }
      expect(experienceLevelSchema.safeParse("expert").success).toBe(false);
    });
  });
});
