/**
 * @fileoverview Integration tests for check-in geo-verification and spot creation
 *
 * Tests critical paths:
 * - Haversine distance calculation accuracy
 * - Geo-verification boundary conditions (exactly at radius, just outside)
 * - Check-in deduplication (unique per user/spot/day)
 * - Replay protection for check-ins (nonce, timestamp, clock skew)
 * - Truth event logging on check-in success/failure
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks
// =============================================================================

vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    NODE_ENV: "test",
  },
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

vi.mock("../services/analyticsService", () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

// Use a mutable reference so tests can swap it
let _mockDb: any = null;

vi.mock("../db", () => ({
  get db() {
    return _mockDb;
  },
}));

vi.mock("@shared/schema", () => ({
  spots: {
    id: "id",
    lat: "lat",
    lng: "lng",
    isActive: "isActive",
    checkInCount: "checkInCount",
    updatedAt: "updatedAt",
  },
  checkIns: {
    id: "id",
    userId: "userId",
    spotId: "spotId",
    timestamp: "timestamp",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((field, value) => ({ field, value })),
  and: vi.fn((...args: any[]) => args),
  getTableColumns: vi.fn(() => ({})),
  sql: vi.fn(),
}));

import { getNearbySpots, verifyAndCheckIn } from "../services/spotService";
import { logServerEvent } from "../services/analyticsService";

// =============================================================================
// Helper: create mock db for verifyAndCheckIn
// =============================================================================
function createMockDb(
  spot: { id: number; lat: number; lng: number } | null,
  checkInId: number = 100
) {
  const limitFn = vi.fn().mockResolvedValue(spot ? [spot] : []);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });

  const returningFn = vi.fn().mockResolvedValue([{ id: checkInId }]);
  const insertValuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });

  const updateWhereFn = vi.fn().mockResolvedValue(undefined);
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });

  const txFn = vi.fn(async (cb: any) => {
    return cb({ insert: insertFn, update: updateFn });
  });

  return {
    db: { select: selectFn, transaction: txFn },
    insertFn,
    updateFn,
    txFn,
  };
}

function setDb(db: any) {
  _mockDb = db;
}

// =============================================================================
// GEO-VERIFICATION TESTS
// =============================================================================

describe("Check-in Geo-Verification - Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mockDb = null;
  });

  // ===========================================================================
  // Distance boundary tests
  // ===========================================================================

  describe("distance boundary conditions", () => {
    it("accepts check-in at exact spot location (0m distance)", async () => {
      const spot = { id: 1, lat: 40.7128, lng: -74.006 };
      const { db } = createMockDb(spot);
      setDb(db);

      const result = await verifyAndCheckIn("user-1", 1, 40.7128, -74.006);
      expect(result).toEqual({ success: true, checkInId: 100 });
    });

    it("accepts check-in within 10m of spot", async () => {
      // ~10m offset in latitude at NYC
      const spot = { id: 1, lat: 40.7128, lng: -74.006 };
      const { db } = createMockDb(spot);
      setDb(db);

      const result = await verifyAndCheckIn("user-1", 1, 40.71289, -74.006);
      expect(result).toEqual({ success: true, checkInId: 100 });
    });

    it("rejects check-in far beyond radius (1km away)", async () => {
      const spot = { id: 1, lat: 40.7128, lng: -74.006 };
      const { db } = createMockDb(spot);
      setDb(db);

      // ~1km north
      const result = await verifyAndCheckIn("user-1", 1, 40.7218, -74.006);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe("Too far from spot");
        expect(result.code).toBe("TOO_FAR");
        expect(result.distance).toBeGreaterThan(500);
        expect(typeof result.radius).toBe("number");
      }
    });

    it("rejects check-in at exactly 100m away (no accuracy)", async () => {
      const spot = { id: 1, lat: 0, lng: 0 };
      const { db } = createMockDb(spot);
      setDb(db);

      // ~100m offset in latitude (0.0009 degrees at equator)
      const result = await verifyAndCheckIn("user-1", 1, 0.0009, 0);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("TOO_FAR");
        expect(result.distance).toBeGreaterThan(50);
        expect(typeof result.radius).toBe("number");
      }
    });

    it("accepts check-in at 60m when accuracy is 20m", async () => {
      const spot = { id: 1, lat: 0, lng: 0 };
      const { db } = createMockDb(spot);
      setDb(db);

      // ~55m offset (0.0005 degrees at equator ≈ 55m)
      const result = await verifyAndCheckIn("user-1", 1, 0.0005, 0, 20);
      // effective radius = 50 + 20 = 70m, distance ≈ 55m → should accept
      expect(result).toEqual({ success: true, checkInId: 100 });
    });

    it("caps accuracy bonus at MAX_CHECK_IN_RADIUS", async () => {
      const spot = { id: 1, lat: 0, lng: 0 };
      const { db } = createMockDb(spot);
      setDb(db);

      // ~160m offset (0.00144 degrees at equator ≈ 160m)
      const result = await verifyAndCheckIn("user-1", 1, 0.00144, 0, 500);
      // accuracy bonus capped at 100, effective radius = 50 + 100 = 150, but capped at 150
      // distance ≈ 160m > 150m → should reject
      expect(result.success).toBe(false);
    });

    it("handles negative latitude/longitude correctly (Sydney)", async () => {
      const spot = { id: 1, lat: -33.8688, lng: 151.2093 };
      const { db } = createMockDb(spot);
      setDb(db);

      const result = await verifyAndCheckIn("user-1", 1, -33.8688, 151.2093);
      expect(result).toEqual({ success: true, checkInId: 100 });
    });

    it("handles spots near date line (lng ~180)", async () => {
      const spot = { id: 1, lat: 0, lng: 179.999 };
      const { db } = createMockDb(spot);
      setDb(db);

      const result = await verifyAndCheckIn("user-1", 1, 0, 179.999);
      expect(result).toEqual({ success: true, checkInId: 100 });
    });

    it("handles spots near poles", async () => {
      const spot = { id: 1, lat: 89.999, lng: 0 };
      const { db } = createMockDb(spot);
      setDb(db);

      const result = await verifyAndCheckIn("user-1", 1, 89.999, 0);
      expect(result).toEqual({ success: true, checkInId: 100 });
    });
  });

  // ===========================================================================
  // Check-in deduplication
  // ===========================================================================

  describe("check-in deduplication", () => {
    it("returns 'Already checked in today' on unique constraint violation", async () => {
      const spot = { id: 1, lat: 40.7128, lng: -74.006 };
      const limitFn = vi.fn().mockResolvedValue([spot]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      const pgError = Object.assign(new Error("unique violation"), { code: "23505" });
      const txFn = vi.fn().mockRejectedValue(pgError);

      setDb({ select: selectFn, transaction: txFn });

      const result = await verifyAndCheckIn("user-1", 1, 40.7128, -74.006);
      expect(result).toEqual({ success: false, message: "Already checked in today" });
    });

    it("rethrows non-23505 postgres errors", async () => {
      const spot = { id: 1, lat: 40.7128, lng: -74.006 };
      const limitFn = vi.fn().mockResolvedValue([spot]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      const otherError = Object.assign(new Error("foreign key"), { code: "23503" });
      const txFn = vi.fn().mockRejectedValue(otherError);

      setDb({ select: selectFn, transaction: txFn });

      await expect(verifyAndCheckIn("user-1", 1, 40.7128, -74.006)).rejects.toThrow("foreign key");
    });

    it("rethrows non-PG errors (no code property)", async () => {
      const spot = { id: 1, lat: 40.7128, lng: -74.006 };
      const limitFn = vi.fn().mockResolvedValue([spot]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      const txFn = vi.fn().mockRejectedValue(new Error("network error"));

      setDb({ select: selectFn, transaction: txFn });

      await expect(verifyAndCheckIn("user-1", 1, 40.7128, -74.006)).rejects.toThrow(
        "network error"
      );
    });
  });

  // ===========================================================================
  // Analytics event logging
  // ===========================================================================

  describe("truth event logging", () => {
    it("logs spot_checkin_validated with correct metadata after success", async () => {
      const spot = { id: 1, lat: 40.7128, lng: -74.006 };
      const { db } = createMockDb(spot, 42);
      setDb(db);

      await verifyAndCheckIn("user-abc", 1, 40.7128, -74.006);

      expect(logServerEvent).toHaveBeenCalledWith("user-abc", "spot_checkin_validated", {
        spot_id: "1",
        check_in_id: "42",
        distance_meters: expect.any(Number),
      });
    });

    it("does not log event on failed check-in (too far)", async () => {
      const spot = { id: 1, lat: 0, lng: 0 };
      const { db } = createMockDb(spot);
      setDb(db);

      await verifyAndCheckIn("user-abc", 1, 10, 10);

      expect(logServerEvent).not.toHaveBeenCalled();
    });

    it("does not log event on duplicate check-in", async () => {
      const spot = { id: 1, lat: 40.7128, lng: -74.006 };
      const limitFn = vi.fn().mockResolvedValue([spot]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });

      const pgError = Object.assign(new Error("unique violation"), { code: "23505" });
      const txFn = vi.fn().mockRejectedValue(pgError);

      setDb({ select: selectFn, transaction: txFn });

      await verifyAndCheckIn("user-abc", 1, 40.7128, -74.006);

      expect(logServerEvent).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error handling
  // ===========================================================================

  describe("error handling", () => {
    it("throws when database is not available", async () => {
      setDb(null);
      await expect(verifyAndCheckIn("user-1", 1, 40.7, -74.0)).rejects.toThrow(
        "Database not available"
      );
    });

    it("throws when spot does not exist", async () => {
      const { db } = createMockDb(null);
      setDb(db);

      await expect(verifyAndCheckIn("user-1", 999, 40.7, -74.0)).rejects.toThrow("Spot not found");
    });
  });

  // ===========================================================================
  // getNearbySpots
  // ===========================================================================

  describe("getNearbySpots", () => {
    it("returns empty array when db is null", async () => {
      setDb(null);
      const result = await getNearbySpots(40.7, -74.0, 5);
      expect(result).toEqual([]);
    });

    it("queries database and returns results", async () => {
      const spots = [
        { id: 1, name: "Hubba Hideout", distanceKm: 0.5 },
        { id: 2, name: "EMB", distanceKm: 1.2 },
      ];
      const orderByFn = vi.fn().mockResolvedValue(spots);
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      setDb({ select: selectFn });

      const result = await getNearbySpots(40.7, -74.0, 5);
      expect(result).toEqual(spots);
      expect(result).toHaveLength(2);
    });

    it("passes correct parameters for radius query", async () => {
      const orderByFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      setDb({ select: selectFn });

      await getNearbySpots(37.7749, -122.4194, 10);
      expect(selectFn).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// REPLAY PROTECTION TESTS
// =============================================================================

describe("Replay Protection - Integration", () => {
  let verifyReplayProtection: any;
  let createMemoryReplayStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../services/replayProtection");
    verifyReplayProtection = mod.verifyReplayProtection;
    createMemoryReplayStore = mod.createMemoryReplayStore;
  });

  describe("timestamp validation", () => {
    it("rejects invalid timestamp format", async () => {
      const store = createMemoryReplayStore();
      const result = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 40.7,
          lng: -74.0,
          nonce: "abc123",
          clientTimestamp: "not-a-date",
        },
        store
      );
      expect(result).toEqual({ ok: false, reason: "invalid_timestamp" });
    });

    it("rejects stale timestamp beyond clock skew tolerance", async () => {
      const store = createMemoryReplayStore();
      const staleTime = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const result = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 40.7,
          lng: -74.0,
          nonce: "abc123",
          clientTimestamp: staleTime,
        },
        store
      );
      expect(result).toEqual({ ok: false, reason: "stale_timestamp" });
    });

    it("accepts timestamp within clock skew tolerance", async () => {
      const store = createMemoryReplayStore();
      const recentTime = new Date(Date.now() - 60 * 1000).toISOString();
      const result = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 40.7,
          lng: -74.0,
          nonce: "unique-nonce-1",
          clientTimestamp: recentTime,
        },
        store
      );
      expect(result).toEqual({ ok: true });
    });

    it("accepts current timestamp", async () => {
      const store = createMemoryReplayStore();
      const now = new Date().toISOString();
      const result = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 40.7,
          lng: -74.0,
          nonce: "unique-nonce-2",
          clientTimestamp: now,
        },
        store
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe("nonce deduplication", () => {
    it("detects replay when same nonce is used twice", async () => {
      const store = createMemoryReplayStore();
      const now = new Date().toISOString();
      const payload = {
        spotId: 1,
        lat: 40.7,
        lng: -74.0,
        nonce: "duplicate-nonce",
        clientTimestamp: now,
      };

      const first = await verifyReplayProtection("user-1", payload, store);
      expect(first).toEqual({ ok: true });

      const second = await verifyReplayProtection("user-1", payload, store);
      expect(second).toEqual({ ok: false, reason: "replay_detected" });
    });

    it("allows same nonce from different users", async () => {
      const store = createMemoryReplayStore();
      const now = new Date().toISOString();
      const payload = {
        spotId: 1,
        lat: 40.7,
        lng: -74.0,
        nonce: "shared-nonce",
        clientTimestamp: now,
      };

      const first = await verifyReplayProtection("user-1", payload, store);
      expect(first).toEqual({ ok: true });

      const second = await verifyReplayProtection("user-2", payload, store);
      expect(second).toEqual({ ok: true });
    });

    it("allows different nonces from same user", async () => {
      const store = createMemoryReplayStore();
      const now = new Date().toISOString();

      const result1 = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 40.7,
          lng: -74.0,
          nonce: "nonce-a",
          clientTimestamp: now,
        },
        store
      );
      expect(result1).toEqual({ ok: true });

      const result2 = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 40.7,
          lng: -74.0,
          nonce: "nonce-b",
          clientTimestamp: now,
        },
        store
      );
      expect(result2).toEqual({ ok: true });
    });
  });

  describe("future timestamp handling", () => {
    it("rejects future timestamp beyond clock skew", async () => {
      const store = createMemoryReplayStore();
      const futureTime = new Date(Date.now() + 3 * 60 * 1000).toISOString();
      const result = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 40.7,
          lng: -74.0,
          nonce: "future-nonce",
          clientTimestamp: futureTime,
        },
        store
      );
      expect(result).toEqual({ ok: false, reason: "stale_timestamp" });
    });

    it("accepts slightly future timestamp within tolerance", async () => {
      const store = createMemoryReplayStore();
      const slightlyFuture = new Date(Date.now() + 30 * 1000).toISOString();
      const result = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 40.7,
          lng: -74.0,
          nonce: "slight-future-nonce",
          clientTimestamp: slightlyFuture,
        },
        store
      );
      expect(result).toEqual({ ok: true });
    });
  });
});
