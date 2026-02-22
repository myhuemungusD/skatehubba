/**
 * @fileoverview Unit tests for server/routes/spots.ts (spotsRouter)
 *
 * Tests:
 * - GET  /api/spots          — list all spots
 * - GET  /api/spots/discover  — discover skateparks via OSM
 * - GET  /api/spots/:spotId   — get a single spot
 * - POST /api/spots/:spotId/rate — rate a spot
 * - POST /api/spots           — create a new spot
 * - POST /api/spots/check-in  — check in at a spot
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

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

vi.mock("../services/spotService", () => ({ verifyAndCheckIn: vi.fn() }));
vi.mock("../services/osmDiscovery", () => ({
  discoverSkateparks: vi.fn(),
  isAreaCached: vi.fn(),
}));
vi.mock("../services/auditLog", () => ({ logAuditEvent: vi.fn() }));
vi.mock("../services/replayProtection", () => ({
  verifyReplayProtection: vi.fn(),
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser ?? {
      id: "user1",
      firstName: "Test",
      email: "test@test.com",
      isEmailVerified: true,
    };
    next();
  }),
  requireEmailVerification: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../middleware/security", () => ({
  checkInIpLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  perUserCheckInLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  perUserSpotWriteLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  publicWriteLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  spotRatingLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
  spotDiscoveryLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../middleware/csrf", () => ({
  requireCsrfToken: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../middleware/requirePaidOrPro", () => ({
  requirePaidOrPro: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../middleware/validation", () => ({
  validateBody: vi.fn(() => (req: any, _res: any, next: any) => {
    req.validatedBody = req.body;
    next();
  }),
}));

vi.mock("../utils/ip", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@shared/schema", () => ({
  insertSpotSchema: {} as any,
}));

vi.mock("@shared/validation/spotCheckIn", () => ({
  SpotCheckInSchema: {} as any,
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Capture route handlers via mock Router
const routeHandlers: Record<string, any[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    get: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`GET ${path}`] = handlers;
    }),
    post: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    }),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../routes/spots");

const { spotStorage } = await import("../storage/spots");
const { verifyAndCheckIn } = await import("../services/spotService");
const { discoverSkateparks, isAreaCached } = await import("../services/osmDiscovery");
const { logAuditEvent } = await import("../services/auditLog");
const { verifyReplayProtection } = await import("../services/replayProtection");
const logger = (await import("../logger")).default;

// ============================================================================
// Helpers
// ============================================================================

function mockReq(overrides: Record<string, any> = {}) {
  return {
    query: {},
    params: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    currentUser: {
      id: "user1",
      firstName: "Test",
      email: "test@test.com",
      isEmailVerified: true,
    },
    ...overrides,
  };
}

function mockRes() {
  const res: any = {};
  res.json = vi.fn().mockReturnThis();
  res.status = vi.fn().mockReturnThis();
  res.sendStatus = vi.fn().mockReturnThis();
  return res;
}

async function callHandler(routeKey: string, req: any, res: any) {
  const handlers = routeHandlers[routeKey];
  if (!handlers) throw new Error(`Route ${routeKey} not registered`);
  const handler = handlers[handlers.length - 1];
  await handler(req, res);
}

// ============================================================================
// Tests
// ============================================================================

describe("Spots Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      const res = mockRes();
      await callHandler("GET /", mockReq(), res);

      expect(spotStorage.getAllSpots).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(spotsData);
    });

    it("should return empty array on error", async () => {
      vi.mocked(spotStorage.getAllSpots).mockRejectedValue(new Error("DB down"));

      const res = mockRes();
      await callHandler("GET /", mockReq(), res);

      expect(res.json).toHaveBeenCalledWith([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/spots/discover
  // --------------------------------------------------------------------------
  describe("GET /api/spots/discover", () => {
    it("should return 400 for invalid lat/lng", async () => {
      const res = mockRes();
      await callHandler("GET /discover", mockReq({ query: { lat: "abc", lng: "def" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it("should return 400 for out-of-range lat", async () => {
      const res = mockRes();
      await callHandler("GET /discover", mockReq({ query: { lat: "100", lng: "50" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for out-of-range lng", async () => {
      const res = mockRes();
      await callHandler("GET /discover", mockReq({ query: { lat: "40", lng: "200" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return cached results when area is already cached", async () => {
      vi.mocked(isAreaCached).mockResolvedValue(true);
      const allSpots = [{ id: 1, name: "Cached Park" }];
      vi.mocked(spotStorage.getAllSpots).mockResolvedValue(allSpots as any);

      const res = mockRes();
      await callHandler("GET /discover", mockReq({ query: { lat: "40.7", lng: "-74.0" } }), res);

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
      vi.mocked(spotStorage.checkDuplicate)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      const createdSpot = { id: 10, name: "New Park" };
      vi.mocked(spotStorage.createSpot).mockResolvedValue(createdSpot as any);
      vi.mocked(spotStorage.verifySpot).mockResolvedValue(createdSpot as any);
      const allSpots = [createdSpot];
      vi.mocked(spotStorage.getAllSpots).mockResolvedValue(allSpots as any);

      const res = mockRes();
      await callHandler("GET /discover", mockReq({ query: { lat: "40.7", lng: "-74.0" } }), res);

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

      const res = mockRes();
      await callHandler("GET /discover", mockReq({ query: { lat: "40.7", lng: "-74.0" } }), res);

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

      const res = mockRes();
      await callHandler("GET /:spotId", mockReq({ params: { spotId: "1" } }), res);

      expect(spotStorage.getSpotById).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith(spot);
    });

    it("should return 404 when spot not found", async () => {
      vi.mocked(spotStorage.getSpotById).mockResolvedValue(null);

      const res = mockRes();
      await callHandler("GET /:spotId", mockReq({ params: { spotId: "999" } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Spot not found" });
    });

    it("should return 400 for invalid (non-numeric) spotId", async () => {
      const res = mockRes();
      await callHandler("GET /:spotId", mockReq({ params: { spotId: "abc" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid spot ID" });
    });

    it("should return 500 on unexpected error", async () => {
      vi.mocked(spotStorage.getSpotById).mockRejectedValue(new Error("boom"));

      const res = mockRes();
      await callHandler("GET /:spotId", mockReq({ params: { spotId: "1" } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Failed to load spot" });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/spots/:spotId/rate
  // --------------------------------------------------------------------------
  describe("POST /api/spots/:spotId/rate", () => {
    it("should rate a spot and return updated spot", async () => {
      const updated = { id: 1, name: "Park", rating: 4 };
      vi.mocked(spotStorage.updateRating).mockResolvedValue(true as any);
      vi.mocked(spotStorage.getSpotById).mockResolvedValue(updated as any);

      const res = mockRes();
      await callHandler(
        "POST /:spotId/rate",
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
      const res = mockRes();
      await callHandler(
        "POST /:spotId/rate",
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
      vi.mocked(spotStorage.updateRating).mockResolvedValue(true as any);
      vi.mocked(spotStorage.getSpotById).mockResolvedValue(null);

      const res = mockRes();
      await callHandler(
        "POST /:spotId/rate",
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

      const res = mockRes();
      const req = mockReq({
        body: { name: "New Spot", lat: 40.7, lng: -74.0 },
      });
      await callHandler("POST /", req, res);

      expect(spotStorage.checkDuplicate).toHaveBeenCalledWith("New Spot", 40.7, -74.0);
      expect(spotStorage.createSpot).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New Spot", createdBy: "user1" })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "spot.created" })
      );
    });

    it("should return 409 when spot is a duplicate", async () => {
      vi.mocked(spotStorage.checkDuplicate).mockResolvedValue(true);

      const res = mockRes();
      await callHandler(
        "POST /",
        mockReq({ body: { name: "Dup Spot", lat: 40.7, lng: -74.0 } }),
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
      const result = { success: true, checkInId: "ci-1", message: "Checked in!" };
      vi.mocked(verifyAndCheckIn).mockResolvedValue(result as any);

      const res = mockRes();
      await callHandler("POST /check-in", mockReq({ body: validCheckInBody }), res);

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

      const res = mockRes();
      await callHandler("POST /check-in", mockReq({ body: validCheckInBody }), res);

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

      const res = mockRes();
      await callHandler("POST /check-in", mockReq({ body: validCheckInBody }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid check-in timestamp" });
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

      const res = mockRes();
      await callHandler("POST /check-in", mockReq({ body: validCheckInBody }), res);

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

      const res = mockRes();
      await callHandler("POST /check-in", mockReq({ body: validCheckInBody }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Spot not found" });
    });

    it("should return 500 on unexpected error during check-in", async () => {
      vi.mocked(verifyReplayProtection).mockResolvedValue({ ok: true } as any);
      vi.mocked(verifyAndCheckIn).mockRejectedValue(new Error("Unexpected"));

      const res = mockRes();
      await callHandler("POST /check-in", mockReq({ body: validCheckInBody }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Check-in failed" });
    });

    it("should return 401 when currentUser is missing", async () => {
      const res = mockRes();
      await callHandler(
        "POST /check-in",
        mockReq({ body: validCheckInBody, currentUser: null }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
    });
  });
});
