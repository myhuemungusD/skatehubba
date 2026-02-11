/**
 * @fileoverview Comprehensive unit tests for server/routes.ts (registerRoutes)
 *
 * Strategy: mock every dependency, capture route handlers via a mock Express app,
 * then invoke each handler directly with mock req/res objects.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks — all vi.mock() calls MUST appear before any import of the module
// under test so Vitest can hoist them.
// ============================================================================

// -- storage --
vi.mock("../storage/spots", () => ({
  spotStorage: {
    getAllSpots: vi.fn(),
    getSpotById: vi.fn(),
    checkDuplicate: vi.fn(),
    createSpot: vi.fn(),
    verifySpot: vi.fn(),
    updateRating: vi.fn(),
  },
}));

// -- db --
vi.mock("../db", () => ({
  getDb: vi.fn(),
  isDatabaseAvailable: vi.fn(),
}));

// -- auth routes --
vi.mock("../auth/routes", () => ({ setupAuthRoutes: vi.fn() }));

// -- services --
vi.mock("../services/spotService", () => ({ verifyAndCheckIn: vi.fn() }));
vi.mock("../services/osmDiscovery", () => ({
  discoverSkateparks: vi.fn(),
  isAreaCached: vi.fn(),
}));
vi.mock("../services/auditLog", () => ({ logAuditEvent: vi.fn() }));
vi.mock("../services/replayProtection", () => ({
  verifyReplayProtection: vi.fn(),
}));
vi.mock("../services/moderationStore", () => ({ createPost: vi.fn() }));
vi.mock("../services/notificationService", () => ({
  sendQuickMatchNotification: vi.fn(),
}));

// -- sub-routers --
vi.mock("../routes/analytics", () => ({ analyticsRouter: vi.fn() }));
vi.mock("../routes/metrics", () => ({ metricsRouter: vi.fn() }));
vi.mock("../routes/moderation", () => ({ moderationRouter: vi.fn() }));
vi.mock("../routes/admin", () => ({ adminRouter: vi.fn() }));
vi.mock("../routes/profile", () => ({ profileRouter: vi.fn() }));
vi.mock("../routes/games", () => ({
  gamesRouter: vi.fn(),
  forfeitExpiredGames: vi.fn(),
  notifyDeadlineWarnings: vi.fn(),
}));
vi.mock("../routes/trickmint", () => ({ trickmintRouter: vi.fn() }));
vi.mock("../routes/tier", () => ({ tierRouter: vi.fn() }));
vi.mock("../routes/stripeWebhook", () => ({
  stripeWebhookRouter: vi.fn(),
}));
vi.mock("../routes/notifications", () => ({
  notificationsRouter: vi.fn(),
}));
vi.mock("../routes/remoteSkate", () => ({
  remoteSkateRouter: vi.fn(),
}));

// -- middleware --
vi.mock("../middleware/security", () => ({
  checkInIpLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  perUserCheckInLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  perUserSpotWriteLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  publicWriteLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  quickMatchLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  spotRatingLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  spotDiscoveryLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
}));
vi.mock("../middleware/csrf", () => ({
  requireCsrfToken: vi.fn((_r: any, _s: any, n: any) => n()),
}));
vi.mock("../middleware/trustSafety", () => ({
  enforceTrustAction: vi.fn(() => (_r: any, _s: any, n: any) => n()),
}));
vi.mock("../middleware/validation", () => ({
  validateBody: vi.fn(() => (req: any, _res: any, next: any) => {
    req.validatedBody = req.body;
    next();
  }),
}));
vi.mock("../middleware/requirePaidOrPro", () => ({
  requirePaidOrPro: vi.fn((_r: any, _s: any, n: any) => n()),
}));

// -- auth middleware --
vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.currentUser = {
      id: "user1",
      firstName: "Test",
      email: "test@test.com",
      isEmailVerified: true,
    };
    next();
  }),
  requireEmailVerification: vi.fn((_r: any, _s: any, n: any) => n()),
}));

// -- config --
vi.mock("../config/env", () => ({
  env: { IP_HASH_SALT: "test-salt", NODE_ENV: "test" },
}));

// -- shared schema (only table references used by routes.ts) --
vi.mock("@shared/schema", () => ({
  customUsers: {
    id: "id",
    firstName: "firstName",
    lastName: "lastName",
    email: "email",
    firebaseUid: "firebaseUid",
    isActive: "isActive",
    pushToken: "pushToken",
  },
  spots: { _table: "spots" },
  games: { _table: "games" },
  betaSignups: {
    id: "id",
    email: "email",
    submitCount: "submitCount",
    lastSubmittedAt: "lastSubmittedAt",
  },
  insertSpotSchema: {} as any,
}));

// -- drizzle-orm --
vi.mock("drizzle-orm", () => ({
  ilike: vi.fn(),
  or: vi.fn(),
  eq: vi.fn(),
  and: vi.fn((...args: any[]) => args),
  count: vi.fn(() => "count_agg"),
  sql: Object.assign((strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true }), {
    raw: (s: string) => ({ _sql: true, raw: s }),
  }),
}));

// -- shared validation stubs (used as arguments to validateBody, which is itself mocked) --
vi.mock("@shared/validation/betaSignup", () => ({
  BetaSignupInput: {} as any,
}));
vi.mock("@shared/validation/spotCheckIn", () => ({
  SpotCheckInSchema: {} as any,
}));

// -- logger --
vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ============================================================================
// Dynamic imports (after all mocks are registered)
// ============================================================================

const { registerRoutes } = await import("../routes");

// Re-import the mocked modules so we can control return values in each test.
const { spotStorage } = await import("../storage/spots");
const { getDb, isDatabaseAvailable } = await import("../db");
const { verifyAndCheckIn } = await import("../services/spotService");
const { discoverSkateparks, isAreaCached } = await import("../services/osmDiscovery");
const { logAuditEvent } = await import("../services/auditLog");
const { verifyReplayProtection } = await import("../services/replayProtection");
const { createPost } = await import("../services/moderationStore");
const { sendQuickMatchNotification } = await import("../services/notificationService");
const { forfeitExpiredGames, notifyDeadlineWarnings } = await import("../routes/games");
const logger = (await import("../logger")).default;

// ============================================================================
// Helpers
// ============================================================================

/** A map that captures the LAST handler (the actual route logic) for each route. */
const routes = new Map<string, Function>();

/** Build a minimal Express-like object that records route registrations. */
function buildMockApp() {
  routes.clear();

  const captureRoute =
    (method: string) =>
    (path: string, ...handlers: Function[]) => {
      routes.set(`${method} ${path}`, handlers[handlers.length - 1]);
    };

  return {
    get: vi.fn(captureRoute("GET")),
    post: vi.fn(captureRoute("POST")),
    use: vi.fn(),
  };
}

/** Create a mock response that supports chaining. */
function mockRes() {
  const res: any = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    sendStatus: vi.fn().mockReturnThis(),
  };
  return res;
}

/** Create a base mock request. */
function mockReq(overrides: Record<string, any> = {}) {
  return {
    query: {},
    params: {},
    body: {},
    headers: {},
    currentUser: {
      id: "user1",
      firstName: "Test",
      email: "test@test.com",
      isEmailVerified: true,
    },
    ip: "127.0.0.1",
    ...overrides,
  };
}

// ============================================================================
// Bootstrap: call registerRoutes once so route handlers are captured.
// ============================================================================

let mockApp: ReturnType<typeof buildMockApp>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockApp = buildMockApp();
  await registerRoutes(mockApp as any);
});

// ============================================================================
// Tests
// ============================================================================

describe("registerRoutes", () => {
  // --------------------------------------------------------------------------
  // Sub-router mounting
  // --------------------------------------------------------------------------
  describe("sub-router mounting", () => {
    it("should mount all sub-routers via app.use()", async () => {
      const useCalls = mockApp.use.mock.calls.map((c: any[]) => c[0]);
      expect(useCalls).toContain("/api/analytics");
      expect(useCalls).toContain("/api/metrics");
      expect(useCalls).toContain("/api");
      expect(useCalls).toContain("/api/admin");
      expect(useCalls).toContain("/api/profile");
      expect(useCalls).toContain("/api/games");
      expect(useCalls).toContain("/api/trickmint");
      expect(useCalls).toContain("/api/tier");
      expect(useCalls).toContain("/webhooks/stripe");
      expect(useCalls).toContain("/api/notifications");
      expect(useCalls).toContain("/api/remote-skate");
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/spots
  // --------------------------------------------------------------------------
  describe("GET /api/spots", () => {
    it("should return all spots on success", async () => {
      const spotsData = [
        { id: 1, name: "Park A" },
        { id: 2, name: "Park B" },
      ];
      vi.mocked(spotStorage.getAllSpots).mockResolvedValue(spotsData as any);

      const handler = routes.get("GET /api/spots")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(spotStorage.getAllSpots).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(spotsData);
    });

    it("should return empty array on error", async () => {
      vi.mocked(spotStorage.getAllSpots).mockRejectedValue(new Error("DB down"));

      const handler = routes.get("GET /api/spots")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/spots/discover
  // --------------------------------------------------------------------------
  describe("GET /api/spots/discover", () => {
    it("should return 400 for invalid lat/lng", async () => {
      const handler = routes.get("GET /api/spots/discover")!;
      const res = mockRes();
      await handler(mockReq({ query: { lat: "abc", lng: "def" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it("should return 400 for out-of-range lat", async () => {
      const handler = routes.get("GET /api/spots/discover")!;
      const res = mockRes();
      await handler(mockReq({ query: { lat: "100", lng: "50" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for out-of-range lng", async () => {
      const handler = routes.get("GET /api/spots/discover")!;
      const res = mockRes();
      await handler(mockReq({ query: { lat: "40", lng: "200" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return cached results when area is already cached", async () => {
      vi.mocked(isAreaCached).mockResolvedValue(true);
      const allSpots = [{ id: 1, name: "Cached Park" }];
      vi.mocked(spotStorage.getAllSpots).mockResolvedValue(allSpots as any);

      const handler = routes.get("GET /api/spots/discover")!;
      const res = mockRes();
      await handler(mockReq({ query: { lat: "40.7", lng: "-74.0" } }), res);

      expect(isAreaCached).toHaveBeenCalledWith(40.7, -74.0);
      expect(res.json).toHaveBeenCalledWith({
        discovered: 0,
        added: 0,
        cached: true,
        spots: allSpots,
      });
      expect(discoverSkateparks).not.toHaveBeenCalled();
    });

    it("should discover, deduplicate, create, verify, and return spots", async () => {
      vi.mocked(isAreaCached).mockResolvedValue(false);

      const discovered = [
        {
          name: "New Park",
          description: "A park",
          spotType: "skatepark",
          lat: 40.7,
          lng: -74.0,
          address: "123 St",
          city: "NYC",
          state: "NY",
          country: "USA",
        },
        {
          name: "Dup Park",
          description: "Dup",
          spotType: "skatepark",
          lat: 40.8,
          lng: -74.1,
          address: null,
          city: null,
          state: null,
          country: null,
        },
      ];
      vi.mocked(discoverSkateparks).mockResolvedValue(discovered as any);

      // First call: not duplicate; second call: duplicate
      vi.mocked(spotStorage.checkDuplicate)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const createdSpot = { id: 10, name: "New Park" };
      vi.mocked(spotStorage.createSpot).mockResolvedValue(createdSpot as any);
      vi.mocked(spotStorage.verifySpot).mockResolvedValue(createdSpot as any);

      const allSpots = [createdSpot];
      vi.mocked(spotStorage.getAllSpots).mockResolvedValue(allSpots as any);

      const handler = routes.get("GET /api/spots/discover")!;
      const res = mockRes();
      await handler(mockReq({ query: { lat: "40.7", lng: "-74.0" } }), res);

      expect(discoverSkateparks).toHaveBeenCalledWith(40.7, -74.0);
      expect(spotStorage.createSpot).toHaveBeenCalledTimes(1);
      expect(spotStorage.verifySpot).toHaveBeenCalledWith(10);
      expect(res.json).toHaveBeenCalledWith({
        discovered: 2,
        added: 1,
        spots: allSpots,
      });
    });

    it("should return existing spots when discovery throws", async () => {
      vi.mocked(isAreaCached).mockResolvedValue(false);
      vi.mocked(discoverSkateparks).mockRejectedValue(new Error("OSM timeout"));

      const existingSpots = [{ id: 5, name: "Old Park" }];
      vi.mocked(spotStorage.getAllSpots).mockResolvedValue(existingSpots as any);

      const handler = routes.get("GET /api/spots/discover")!;
      const res = mockRes();
      await handler(mockReq({ query: { lat: "40.7", lng: "-74.0" } }), res);

      expect(logger.error).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        discovered: 0,
        added: 0,
        spots: existingSpots,
      });
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/spots/:spotId
  // --------------------------------------------------------------------------
  describe("GET /api/spots/:spotId", () => {
    it("should return spot when found", async () => {
      const spot = { id: 1, name: "Test Park" };
      vi.mocked(spotStorage.getSpotById).mockResolvedValue(spot as any);

      const handler = routes.get("GET /api/spots/:spotId")!;
      const res = mockRes();
      await handler(mockReq({ params: { spotId: "1" } }), res);

      expect(spotStorage.getSpotById).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith(spot);
    });

    it("should return 404 when spot not found", async () => {
      vi.mocked(spotStorage.getSpotById).mockResolvedValue(null);

      const handler = routes.get("GET /api/spots/:spotId")!;
      const res = mockRes();
      await handler(mockReq({ params: { spotId: "999" } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Spot not found" });
    });

    it("should return 400 for invalid (non-numeric) spotId", async () => {
      const handler = routes.get("GET /api/spots/:spotId")!;
      const res = mockRes();
      await handler(mockReq({ params: { spotId: "abc" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid spot ID" });
    });

    it("should return 500 on unexpected error", async () => {
      vi.mocked(spotStorage.getSpotById).mockRejectedValue(new Error("boom"));

      const handler = routes.get("GET /api/spots/:spotId")!;
      const res = mockRes();
      await handler(mockReq({ params: { spotId: "1" } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Failed to load spot",
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/spots/:spotId/rate
  // --------------------------------------------------------------------------
  describe("POST /api/spots/:spotId/rate", () => {
    it("should rate a spot and return updated spot", async () => {
      const updated = { id: 1, name: "Park", rating: 4 };
      vi.mocked(spotStorage.updateRating).mockResolvedValue(true);
      vi.mocked(spotStorage.getSpotById).mockResolvedValue(updated as any);

      const handler = routes.get("POST /api/spots/:spotId/rate")!;
      const res = mockRes();
      await handler(
        mockReq({
          params: { spotId: "1" },
          body: { rating: 4 },
          validatedBody: { rating: 4 },
        }),
        res
      );

      expect(spotStorage.updateRating).toHaveBeenCalledWith(1, 4, "user1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it("should return 400 for invalid spotId", async () => {
      const handler = routes.get("POST /api/spots/:spotId/rate")!;
      const res = mockRes();
      await handler(
        mockReq({
          params: { spotId: "abc" },
          body: { rating: 4 },
          validatedBody: { rating: 4 },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid spot ID" });
    });

    it("should return 404 when spot disappears after rating update", async () => {
      vi.mocked(spotStorage.updateRating).mockResolvedValue(true);
      vi.mocked(spotStorage.getSpotById).mockResolvedValue(null);

      const handler = routes.get("POST /api/spots/:spotId/rate")!;
      const res = mockRes();
      await handler(
        mockReq({
          params: { spotId: "1" },
          body: { rating: 5 },
          validatedBody: { rating: 5 },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Spot not found" });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/spots
  // --------------------------------------------------------------------------
  describe("POST /api/spots", () => {
    it("should create a spot and return 201", async () => {
      vi.mocked(spotStorage.checkDuplicate).mockResolvedValue(false);
      const created = { id: 42, name: "New Spot", lat: 40.7, lng: -74.0 };
      vi.mocked(spotStorage.createSpot).mockResolvedValue(created as any);

      const handler = routes.get("POST /api/spots")!;
      const res = mockRes();
      const req = mockReq({
        body: { name: "New Spot", lat: 40.7, lng: -74.0 },
      });
      await handler(req, res);

      expect(spotStorage.checkDuplicate).toHaveBeenCalledWith("New Spot", 40.7, -74.0);
      expect(spotStorage.createSpot).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Spot",
          createdBy: "user1",
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "spot.created" })
      );
    });

    it("should return 409 when spot is a duplicate", async () => {
      vi.mocked(spotStorage.checkDuplicate).mockResolvedValue(true);

      const handler = routes.get("POST /api/spots")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { name: "Dup Spot", lat: 40.7, lng: -74.0 },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining("already exists") })
      );
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "spot.rejected.duplicate" })
      );
      expect(spotStorage.createSpot).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/posts
  // --------------------------------------------------------------------------
  describe("POST /api/posts", () => {
    it("should create a post and return 201", async () => {
      const postResult = { id: "post-1" };
      vi.mocked(createPost).mockResolvedValue(postResult as any);

      const handler = routes.get("POST /api/posts")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { mediaUrl: "https://example.com/vid.mp4", caption: "Sick trick" },
        }),
        res
      );

      expect(createPost).toHaveBeenCalledWith("user1", {
        mediaUrl: "https://example.com/vid.mp4",
        caption: "Sick trick",
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ postId: "post-1" });
    });

    it("should return 400 for invalid body (missing mediaUrl)", async () => {
      const handler = routes.get("POST /api/posts")!;
      const res = mockRes();
      await handler(mockReq({ body: {} }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid request" })
      );
    });

    it("should return 400 for invalid mediaUrl", async () => {
      const handler = routes.get("POST /api/posts")!;
      const res = mockRes();
      await handler(mockReq({ body: { mediaUrl: "not-a-url" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 401 when currentUser.id is missing", async () => {
      const handler = routes.get("POST /api/posts")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { mediaUrl: "https://example.com/vid.mp4" },
          currentUser: { id: undefined },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("should return 401 when currentUser is null", async () => {
      const handler = routes.get("POST /api/posts")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { mediaUrl: "https://example.com/vid.mp4" },
          currentUser: null,
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/spots/check-in
  // --------------------------------------------------------------------------
  describe("POST /api/spots/check-in", () => {
    const validCheckInBody = {
      spotId: 1,
      lat: 40.7,
      lng: -74.0,
      accuracy: 10,
      nonce: "abc123abc123abc1",
      clientTimestamp: new Date().toISOString(),
    };

    it("should check in successfully", async () => {
      vi.mocked(verifyReplayProtection).mockResolvedValue({ ok: true } as any);
      const result = {
        success: true,
        checkInId: "ci-1",
        message: "Checked in!",
      };
      vi.mocked(verifyAndCheckIn).mockResolvedValue(result as any);

      const handler = routes.get("POST /api/spots/check-in")!;
      const res = mockRes();
      await handler(mockReq({ body: validCheckInBody }), res);

      expect(verifyReplayProtection).toHaveBeenCalledWith("user1", {
        spotId: 1,
        lat: 40.7,
        lng: -74.0,
        nonce: validCheckInBody.nonce,
        clientTimestamp: validCheckInBody.clientTimestamp,
      });
      expect(verifyAndCheckIn).toHaveBeenCalledWith("user1", 1, 40.7, -74.0, 10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "spot.checkin.approved" })
      );
    });

    it("should return 409 when replay is detected", async () => {
      vi.mocked(verifyReplayProtection).mockResolvedValue({
        ok: false,
        reason: "replay_detected",
      } as any);

      const handler = routes.get("POST /api/spots/check-in")!;
      const res = mockRes();
      await handler(mockReq({ body: validCheckInBody }), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: "Replay detected" });
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "spot.checkin.rejected" })
      );
    });

    it("should return 400 when timestamp is invalid", async () => {
      vi.mocked(verifyReplayProtection).mockResolvedValue({
        ok: false,
        reason: "bad_timestamp",
      } as any);

      const handler = routes.get("POST /api/spots/check-in")!;
      const res = mockRes();
      await handler(mockReq({ body: validCheckInBody }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Invalid check-in timestamp",
      });
    });

    it("should return 422 when verifyAndCheckIn fails (e.g. too far)", async () => {
      vi.mocked(verifyReplayProtection).mockResolvedValue({ ok: true } as any);
      vi.mocked(verifyAndCheckIn).mockResolvedValue({
        success: false,
        message: "Too far from spot",
        code: "TOO_FAR",
        distance: 500,
        radius: 100,
      } as any);

      const handler = routes.get("POST /api/spots/check-in")!;
      const res = mockRes();
      await handler(mockReq({ body: validCheckInBody }), res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        message: "Too far from spot",
        code: "TOO_FAR",
        distance: 500,
        radius: 100,
      });
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "spot.checkin.denied" })
      );
    });

    it("should return 404 when spot is not found during check-in", async () => {
      vi.mocked(verifyReplayProtection).mockResolvedValue({ ok: true } as any);
      vi.mocked(verifyAndCheckIn).mockRejectedValue(new Error("Spot not found"));

      const handler = routes.get("POST /api/spots/check-in")!;
      const res = mockRes();
      await handler(mockReq({ body: validCheckInBody }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Spot not found" });
    });

    it("should return 500 on unexpected error during check-in", async () => {
      vi.mocked(verifyReplayProtection).mockResolvedValue({ ok: true } as any);
      vi.mocked(verifyAndCheckIn).mockRejectedValue(new Error("Unexpected"));

      const handler = routes.get("POST /api/spots/check-in")!;
      const res = mockRes();
      await handler(mockReq({ body: validCheckInBody }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Check-in failed" });
    });

    it("should return 401 when currentUser is missing", async () => {
      const handler = routes.get("POST /api/spots/check-in")!;
      const res = mockRes();
      await handler(mockReq({ body: validCheckInBody, currentUser: null }), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: "Authentication required",
      });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/beta-signup
  // --------------------------------------------------------------------------
  describe("POST /api/beta-signup", () => {
    /** Helper: build a mock db with chainable select/insert/update */
    function buildMockDb(
      options: {
        selectResult?: any[];
        insertReject?: Error;
        updateReject?: Error;
      } = {}
    ) {
      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockImplementation(() => {
        return Promise.resolve(options.selectResult ?? []);
      });
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.values = vi.fn().mockImplementation(() => {
        if (options.insertReject) return Promise.reject(options.insertReject);
        return Promise.resolve();
      });
      chain.update = vi.fn().mockReturnValue(chain);
      chain.set = vi.fn().mockReturnValue(chain);
      // For update().set().where()
      chain.where = vi.fn().mockImplementation(() => {
        if (options.updateReject) return Promise.reject(options.updateReject);
        return Promise.resolve();
      });
      // Reassign select chain's where: use from chain
      const selectChain: any = {};
      selectChain.select = vi.fn().mockReturnValue(selectChain);
      selectChain.from = vi.fn().mockReturnValue(selectChain);
      selectChain.where = vi.fn().mockReturnValue(selectChain);
      selectChain.limit = vi.fn().mockResolvedValue(options.selectResult ?? []);

      // Build a db object that handles both select and insert/update chains.
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(options.selectResult ?? []),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation(() => {
            if (options.insertReject) return Promise.reject(options.insertReject);
            return Promise.resolve();
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              if (options.updateReject) return Promise.reject(options.updateReject);
              return Promise.resolve();
            }),
          }),
        }),
      };
      return db;
    }

    it("should create a new beta signup and return ok", async () => {
      const db = buildMockDb({ selectResult: [] });
      vi.mocked(getDb).mockReturnValue(db);

      const handler = routes.get("POST /api/beta-signup")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { email: "new@test.com", platform: "ios" },
          headers: { "x-forwarded-for": "1.2.3.4" },
        }),
        res
      );

      expect(getDb).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("should return 429 when existing signup is within rate limit window", async () => {
      const recentDate = new Date(); // Just now
      const existing = {
        id: "abc",
        email: "dup@test.com",
        platform: "ios",
        lastSubmittedAt: recentDate,
      };
      const db = buildMockDb({ selectResult: [existing] });
      vi.mocked(getDb).mockReturnValue(db);

      const handler = routes.get("POST /api/beta-signup")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { email: "dup@test.com", platform: "ios" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        ok: false,
        error: "RATE_LIMITED",
      });
    });

    it("should update existing signup when outside rate limit window", async () => {
      const oldDate = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      const existing = {
        id: "abc",
        email: "old@test.com",
        platform: "android",
        lastSubmittedAt: oldDate,
      };
      const db = buildMockDb({ selectResult: [existing] });
      vi.mocked(getDb).mockReturnValue(db);

      const handler = routes.get("POST /api/beta-signup")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { email: "old@test.com", platform: "ios" },
          headers: { "x-forwarded-for": "5.6.7.8" },
        }),
        res
      );

      expect(db.update).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("should return 500 on database error", async () => {
      vi.mocked(getDb).mockImplementation(() => {
        throw new Error("DB connection lost");
      });

      const handler = routes.get("POST /api/beta-signup")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { email: "err@test.com", platform: "ios" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        ok: false,
        error: "SERVER_ERROR",
      });
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/users/search
  // --------------------------------------------------------------------------
  describe("GET /api/users/search", () => {
    function buildSearchDb(results: any[]) {
      return {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(results),
            }),
          }),
        }),
      };
    }

    it("should return mapped user results for valid query", async () => {
      const dbResults = [
        {
          id: "u1",
          firstName: "John",
          lastName: "Doe",
          email: "john@test.com",
          firebaseUid: "fb1",
        },
      ];
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockReturnValue(buildSearchDb(dbResults) as any);

      const handler = routes.get("GET /api/users/search")!;
      const res = mockRes();
      await handler(mockReq({ query: { q: "John" } }), res);

      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "u1",
          displayName: "John Doe",
          handle: "useru1",
        }),
      ]);
    });

    it("should return empty array when query is too short", async () => {
      const handler = routes.get("GET /api/users/search")!;
      const res = mockRes();
      await handler(mockReq({ query: { q: "J" } }), res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should return empty array when query is missing", async () => {
      const handler = routes.get("GET /api/users/search")!;
      const res = mockRes();
      await handler(mockReq({ query: {} }), res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should return empty array when db is unavailable", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const handler = routes.get("GET /api/users/search")!;
      const res = mockRes();
      await handler(mockReq({ query: { q: "Test" } }), res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should return empty array on db error", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockImplementation(() => {
        throw new Error("fail");
      });

      const handler = routes.get("GET /api/users/search")!;
      const res = mockRes();
      await handler(mockReq({ query: { q: "Test" } }), res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should handle user with only firstName (no lastName)", async () => {
      const dbResults = [
        {
          id: "u2",
          firstName: "Solo",
          lastName: null,
          email: "solo@test.com",
          firebaseUid: "fb2",
        },
      ];
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockReturnValue(buildSearchDb(dbResults) as any);

      const handler = routes.get("GET /api/users/search")!;
      const res = mockRes();
      await handler(mockReq({ query: { q: "Solo" } }), res);

      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({
          displayName: "Solo",
        }),
      ]);
    });

    it("should handle user with no name at all", async () => {
      const dbResults = [
        {
          id: "u3",
          firstName: null,
          lastName: null,
          email: "noname@test.com",
          firebaseUid: "fb3",
        },
      ];
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockReturnValue(buildSearchDb(dbResults) as any);

      const handler = routes.get("GET /api/users/search")!;
      const res = mockRes();
      await handler(mockReq({ query: { q: "noname" } }), res);

      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({
          displayName: "Skater",
        }),
      ]);
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/users
  // --------------------------------------------------------------------------
  describe("GET /api/users", () => {
    it("should return users list with only safe fields (no email or firebaseUid)", async () => {
      const dbResults = [
        {
          id: "u1",
          displayName: "Alice",
          photoURL: null,
        },
      ];
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(dbResults),
            }),
          }),
        }),
      } as any);

      const handler = routes.get("GET /api/users")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith(dbResults);
      const returnedData = res.json.mock.calls[0][0];
      for (const user of returnedData) {
        expect(user).not.toHaveProperty("email");
        expect(user).not.toHaveProperty("firebaseUid");
        expect(user).not.toHaveProperty("uid");
        expect(user).toHaveProperty("id");
        expect(user).toHaveProperty("displayName");
      }
    });

    it("should return empty array when db unavailable", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const handler = routes.get("GET /api/users")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should return empty array on error", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockImplementation(() => {
        throw new Error("fail");
      });

      const handler = routes.get("GET /api/users")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/matchmaking/quick-match
  // --------------------------------------------------------------------------
  describe("POST /api/matchmaking/quick-match", () => {
    function buildMatchmakingDb(users: any[]) {
      return {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(users),
            }),
          }),
        }),
      };
    }

    it("should find a match and send notification", async () => {
      const opponents = [
        {
          id: "opponent1",
          firebaseUid: "fb-opp1",
          firstName: "Opponent",
          pushToken: "expo-token-1",
        },
      ];
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockReturnValue(buildMatchmakingDb(opponents) as any);
      vi.mocked(sendQuickMatchNotification).mockResolvedValue(undefined);

      const handler = routes.get("POST /api/matchmaking/quick-match")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(sendQuickMatchNotification).toHaveBeenCalledWith(
        "expo-token-1",
        "Test",
        expect.stringContaining("qm-")
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          match: expect.objectContaining({
            opponentId: "opponent1",
            opponentName: "Opponent",
            opponentFirebaseUid: "fb-opp1",
          }),
        })
      );
    });

    it("should return 404 when no eligible opponents", async () => {
      // Only the current user comes back (no push token or same id)
      const users = [
        {
          id: "user1",
          firebaseUid: "fb1",
          firstName: "Test",
          pushToken: "tok",
        },
      ];
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockReturnValue(buildMatchmakingDb(users) as any);

      const handler = routes.get("POST /api/matchmaking/quick-match")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "No opponents available" })
      );
    });

    it("should return 404 when opponents have no push tokens", async () => {
      const users = [
        {
          id: "other",
          firebaseUid: "fb2",
          firstName: "NoPush",
          pushToken: null,
        },
      ];
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockReturnValue(buildMatchmakingDb(users) as any);

      const handler = routes.get("POST /api/matchmaking/quick-match")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 401 when currentUser is missing", async () => {
      const handler = routes.get("POST /api/matchmaking/quick-match")!;
      const res = mockRes();
      await handler(mockReq({ currentUser: null }), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
    });

    it("should return 503 when db is unavailable", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const handler = routes.get("POST /api/matchmaking/quick-match")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: "Service unavailable",
      });
    });

    it("should return 500 on unexpected error", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockImplementation(() => {
        throw new Error("boom");
      });

      const handler = routes.get("POST /api/matchmaking/quick-match")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to find match",
      });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/cron/forfeit-expired-games
  // --------------------------------------------------------------------------
  describe("POST /api/cron/forfeit-expired-games", () => {
    const CRON_SECRET = "super-secret-value";

    afterEach(() => {
      delete process.env.CRON_SECRET;
    });

    it("should forfeit expired games with valid cron secret", async () => {
      process.env.CRON_SECRET = CRON_SECRET;
      vi.mocked(forfeitExpiredGames).mockResolvedValue({
        forfeited: 3,
      } as any);

      const handler = routes.get("POST /api/cron/forfeit-expired-games")!;
      const res = mockRes();
      await handler(
        mockReq({
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        }),
        res
      );

      expect(forfeitExpiredGames).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, forfeited: 3 })
      );
    });

    it("should return 401 with invalid authorization", async () => {
      process.env.CRON_SECRET = CRON_SECRET;

      const handler = routes.get("POST /api/cron/forfeit-expired-games")!;
      const res = mockRes();
      await handler(
        mockReq({
          headers: { authorization: "Bearer wrong-secret" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
      expect(forfeitExpiredGames).not.toHaveBeenCalled();
    });

    it("should return 401 when no authorization header", async () => {
      process.env.CRON_SECRET = CRON_SECRET;

      const handler = routes.get("POST /api/cron/forfeit-expired-games")!;
      const res = mockRes();
      await handler(mockReq({ headers: {} }), res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 401 when CRON_SECRET is not configured", async () => {
      delete process.env.CRON_SECRET;

      const handler = routes.get("POST /api/cron/forfeit-expired-games")!;
      const res = mockRes();
      await handler(
        mockReq({
          headers: { authorization: "Bearer anything" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should return 500 when forfeitExpiredGames throws", async () => {
      process.env.CRON_SECRET = CRON_SECRET;
      vi.mocked(forfeitExpiredGames).mockRejectedValue(new Error("DB timeout"));

      const handler = routes.get("POST /api/cron/forfeit-expired-games")!;
      const res = mockRes();
      await handler(
        mockReq({
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to process forfeit",
      });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/cron/deadline-warnings
  // --------------------------------------------------------------------------
  describe("POST /api/cron/deadline-warnings", () => {
    const CRON_SECRET = "super-secret-value";

    afterEach(() => {
      delete process.env.CRON_SECRET;
    });

    it("should send deadline warnings with valid cron secret", async () => {
      process.env.CRON_SECRET = CRON_SECRET;
      vi.mocked(notifyDeadlineWarnings).mockResolvedValue({
        notified: 5,
      } as any);

      const handler = routes.get("POST /api/cron/deadline-warnings")!;
      const res = mockRes();
      await handler(
        mockReq({
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        }),
        res
      );

      expect(notifyDeadlineWarnings).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, notified: 5 })
      );
    });

    it("should return 401 with invalid secret", async () => {
      process.env.CRON_SECRET = CRON_SECRET;

      const handler = routes.get("POST /api/cron/deadline-warnings")!;
      const res = mockRes();
      await handler(
        mockReq({
          headers: { authorization: "Bearer nope" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(notifyDeadlineWarnings).not.toHaveBeenCalled();
    });

    it("should return 401 when CRON_SECRET not set", async () => {
      delete process.env.CRON_SECRET;

      const handler = routes.get("POST /api/cron/deadline-warnings")!;
      const res = mockRes();
      await handler(
        mockReq({
          headers: { authorization: "Bearer anything" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 500 when notifyDeadlineWarnings throws", async () => {
      process.env.CRON_SECRET = CRON_SECRET;
      vi.mocked(notifyDeadlineWarnings).mockRejectedValue(new Error("fail"));

      const handler = routes.get("POST /api/cron/deadline-warnings")!;
      const res = mockRes();
      await handler(
        mockReq({
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to send deadline warnings",
      });
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/stats
  // --------------------------------------------------------------------------
  describe("GET /api/stats", () => {
    it("should return aggregated stats", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue([{ count: 42 }]),
        }),
      };
      vi.mocked(getDb).mockReturnValue(mockDb as any);

      const handler = routes.get("GET /api/stats")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith({
        totalUsers: 42,
        totalSpots: 42,
        totalBattles: 42,
      });
    });

    it("should return zero stats when db is unavailable", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const handler = routes.get("GET /api/stats")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith({
        totalUsers: 0,
        totalSpots: 0,
        totalBattles: 0,
      });
    });

    it("should return zero stats on error", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      vi.mocked(getDb).mockImplementation(() => {
        throw new Error("kaboom");
      });

      const handler = routes.get("GET /api/stats")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith({
        totalUsers: 0,
        totalSpots: 0,
        totalBattles: 0,
      });
    });

    it("should handle empty count results gracefully", async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(true);
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue([{}]),
        }),
      };
      vi.mocked(getDb).mockReturnValue(mockDb as any);

      const handler = routes.get("GET /api/stats")!;
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith({
        totalUsers: 0,
        totalSpots: 0,
        totalBattles: 0,
      });
    });
  });

  // --------------------------------------------------------------------------
  // getClientIp helper (tested indirectly through routes that use it)
  // --------------------------------------------------------------------------
  describe("getClientIp (via check-in audit logs)", () => {
    // The getClientIp helper is a local function inside registerRoutes. We test
    // it indirectly by observing the `ip` field passed to logAuditEvent through
    // routes that call getClientIp, such as POST /api/spots and check-in.

    it("should extract IP from x-forwarded-for string header", async () => {
      vi.mocked(spotStorage.checkDuplicate).mockResolvedValue(false);
      vi.mocked(spotStorage.createSpot).mockResolvedValue({
        id: 1,
        lat: 0,
        lng: 0,
      } as any);

      const handler = routes.get("POST /api/spots")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { name: "Spot", lat: 0, lng: 0 },
          headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
        }),
        res
      );

      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ ip: "203.0.113.1" }));
    });

    it("should extract IP from x-forwarded-for array header", async () => {
      vi.mocked(spotStorage.checkDuplicate).mockResolvedValue(false);
      vi.mocked(spotStorage.createSpot).mockResolvedValue({
        id: 2,
        lat: 0,
        lng: 0,
      } as any);

      const handler = routes.get("POST /api/spots")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { name: "Spot2", lat: 0, lng: 0 },
          headers: { "x-forwarded-for": ["198.51.100.1", "10.0.0.2"] },
        }),
        res
      );

      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ ip: "198.51.100.1" }));
    });

    it("should fall back to x-real-ip header", async () => {
      vi.mocked(spotStorage.checkDuplicate).mockResolvedValue(false);
      vi.mocked(spotStorage.createSpot).mockResolvedValue({
        id: 3,
        lat: 0,
        lng: 0,
      } as any);

      const handler = routes.get("POST /api/spots")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { name: "Spot3", lat: 0, lng: 0 },
          headers: { "x-real-ip": "192.0.2.1" },
        }),
        res
      );

      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ ip: "192.0.2.1" }));
    });

    it("should fall back to x-real-ip array header", async () => {
      vi.mocked(spotStorage.checkDuplicate).mockResolvedValue(false);
      vi.mocked(spotStorage.createSpot).mockResolvedValue({
        id: 4,
        lat: 0,
        lng: 0,
      } as any);

      const handler = routes.get("POST /api/spots")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { name: "Spot4", lat: 0, lng: 0 },
          headers: { "x-real-ip": ["10.10.10.10"] },
        }),
        res
      );

      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ ip: "10.10.10.10" }));
    });

    it("should fall back to req.ip when no forwarded headers", async () => {
      vi.mocked(spotStorage.checkDuplicate).mockResolvedValue(false);
      vi.mocked(spotStorage.createSpot).mockResolvedValue({
        id: 5,
        lat: 0,
        lng: 0,
      } as any);

      const handler = routes.get("POST /api/spots")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { name: "Spot5", lat: 0, lng: 0 },
          headers: {},
          ip: "127.0.0.1",
        }),
        res
      );

      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ ip: "127.0.0.1" }));
    });

    it("should return null when no IP info is available", async () => {
      vi.mocked(spotStorage.checkDuplicate).mockResolvedValue(false);
      vi.mocked(spotStorage.createSpot).mockResolvedValue({
        id: 6,
        lat: 0,
        lng: 0,
      } as any);

      const handler = routes.get("POST /api/spots")!;
      const res = mockRes();
      await handler(
        mockReq({
          body: { name: "Spot6", lat: 0, lng: 0 },
          headers: {},
          ip: undefined,
        }),
        res
      );

      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ ip: null }));
    });
  });

  // --------------------------------------------------------------------------
  // verifyCronSecret (tested indirectly through cron routes)
  // --------------------------------------------------------------------------
  describe("verifyCronSecret (via cron routes)", () => {
    afterEach(() => {
      delete process.env.CRON_SECRET;
    });

    it("should reject when authorization header length differs from expected", async () => {
      process.env.CRON_SECRET = "exact";

      const handler = routes.get("POST /api/cron/forfeit-expired-games")!;
      const res = mockRes();
      // "Bearer exact" has 12 chars; "Bearer ex" has 9 chars — length mismatch
      await handler(mockReq({ headers: { authorization: "Bearer ex" } }), res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should reject when authorization has correct length but wrong content", async () => {
      process.env.CRON_SECRET = "abc";

      const handler = routes.get("POST /api/cron/forfeit-expired-games")!;
      const res = mockRes();
      // "Bearer abc" and "Bearer xyz" have same length (10 chars)
      await handler(mockReq({ headers: { authorization: "Bearer xyz" } }), res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should accept when authorization matches exactly", async () => {
      process.env.CRON_SECRET = "correct-secret";
      vi.mocked(forfeitExpiredGames).mockResolvedValue({ forfeited: 0 } as any);

      const handler = routes.get("POST /api/cron/forfeit-expired-games")!;
      const res = mockRes();
      await handler(
        mockReq({
          headers: { authorization: "Bearer correct-secret" },
        }),
        res
      );

      expect(forfeitExpiredGames).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // --------------------------------------------------------------------------
  // Edge case: registerRoutes returns an http.Server
  // --------------------------------------------------------------------------
  describe("return value", () => {
    it("should return an http.Server instance", async () => {
      const app = buildMockApp();
      const server = await registerRoutes(app as any);
      // createServer is the real http.createServer here (not mocked),
      // so we just check it's truthy and has a listen method.
      expect(server).toBeTruthy();
      expect(typeof server.listen).toBe("function");
    });
  });
});
