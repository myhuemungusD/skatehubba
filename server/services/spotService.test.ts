import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../db", () => ({
  db: null as any,
}));

vi.mock("./analyticsService", () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
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

import { getNearbySpots, verifyAndCheckIn } from "./spotService";
import * as dbModule from "../db";
import { logServerEvent } from "./analyticsService";

describe("getNearbySpots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when db is null", async () => {
    (dbModule as any).db = null;
    const result = await getNearbySpots(40.7, -74.0, 5);
    expect(result).toEqual([]);
  });

  it("queries database for nearby spots", async () => {
    const spots = [{ id: 1, name: "Hubba Hideout" }];
    const orderByFn = vi.fn().mockResolvedValue(spots);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    const result = await getNearbySpots(40.7, -74.0, 5);
    expect(result).toEqual(spots);
    expect(selectFn).toHaveBeenCalled();
  });
});

describe("verifyAndCheckIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when db is null", async () => {
    (dbModule as any).db = null;
    await expect(verifyAndCheckIn("u1", 1, 40.7, -74.0)).rejects.toThrow("Database not available");
  });

  it("throws when spot not found", async () => {
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    await expect(verifyAndCheckIn("u1", 999, 40.7, -74.0)).rejects.toThrow("Spot not found");
  });

  it("rejects check-in when too far from spot", async () => {
    // Spot at (0, 0), user at (1, 1) = ~157km away
    const limitFn = vi.fn().mockResolvedValue([{ id: 1, lat: 0, lng: 0 }]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    const result = await verifyAndCheckIn("u1", 1, 1, 1);
    expect(result).toEqual({ success: false, message: "Too far from spot" });
  });

  it("succeeds when user is within radius", async () => {
    // Spot at (40.7128, -74.006), user very close by
    const spot = { id: 1, lat: 40.7128, lng: -74.006 };
    const limitFn = vi.fn().mockResolvedValue([spot]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const returningFn = vi.fn().mockResolvedValue([{ id: 42 }]);
    const insertValuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });

    const updateWhereFn = vi.fn().mockResolvedValue(undefined);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });

    const txFn = vi.fn(async (cb: any) => {
      return cb({ insert: insertFn, update: updateFn });
    });

    (dbModule as any).db = {
      select: selectFn,
      transaction: txFn,
    };

    // User is at nearly the same location
    const result = await verifyAndCheckIn("u1", 1, 40.7128, -74.006);
    expect(result).toEqual({ success: true, checkInId: 42 });
    expect(logServerEvent).toHaveBeenCalledWith("u1", "spot_checkin_validated", expect.any(Object));
  });

  it("returns failure on duplicate check-in (23505 error)", async () => {
    const spot = { id: 1, lat: 40.7128, lng: -74.006 };
    const limitFn = vi.fn().mockResolvedValue([spot]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const pgError = Object.assign(new Error("unique violation"), { code: "23505" });
    const txFn = vi.fn().mockRejectedValue(pgError);

    (dbModule as any).db = { select: selectFn, transaction: txFn };

    const result = await verifyAndCheckIn("u1", 1, 40.7128, -74.006);
    expect(result).toEqual({ success: false, message: "Already checked in today" });
  });

  it("rethrows non-duplicate errors", async () => {
    const spot = { id: 1, lat: 40.7128, lng: -74.006 };
    const limitFn = vi.fn().mockResolvedValue([spot]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const txFn = vi.fn().mockRejectedValue(new Error("connection lost"));

    (dbModule as any).db = { select: selectFn, transaction: txFn };

    await expect(verifyAndCheckIn("u1", 1, 40.7128, -74.006)).rejects.toThrow("connection lost");
  });
});
