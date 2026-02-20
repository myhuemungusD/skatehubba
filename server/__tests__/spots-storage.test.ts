/**
 * @fileoverview Unit tests for spots storage
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockDbChain: any = {};
mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.orderBy = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.limit = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.offset = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.leftJoin = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.insert = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.values = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.onConflictDoUpdate = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.returning = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.$dynamic = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);

let mockDb: any = mockDbChain;

vi.mock("../db", () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock("@shared/schema", () => ({
  spots: {
    _table: "spots",
    id: "id",
    name: "name",
    isActive: "isActive",
    city: "city",
    spotType: "spotType",
    tier: "tier",
    createdBy: "createdBy",
    verified: "verified",
    createdAt: "createdAt",
    checkInCount: "checkInCount",
    rating: "rating",
    ratingCount: "ratingCount",
    lat: "lat",
    lng: "lng",
    updatedAt: "updatedAt",
  },
  spotRatings: {
    _table: "spot_ratings",
    id: "id",
    spotId: "spotId",
    userId: "userId",
    rating: "rating",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  customUsers: {
    id: "id",
    firstName: "firstName",
    lastName: "lastName",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  avg: vi.fn(() => "avg_col"),
  count: vi.fn(() => "count_col"),
  sql: Object.assign((strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true }), {
    raw: (s: string) => ({ _sql: true, raw: s }),
  }),
  getTableColumns: (table: any) => table,
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

const { SpotStorage, spotStorage } = await import("../storage/spots");

// ============================================================================
// Tests
// ============================================================================

describe("SpotStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = mockDbChain;
    mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
  });

  describe("createSpot", () => {
    it("should create a spot and return it", async () => {
      const spot = { id: 1, name: "Test Park", lat: 40.7, lng: -74.0 };
      mockDbChain.then = (resolve: any) => Promise.resolve([spot]).then(resolve);

      const result = await spotStorage.createSpot({
        name: "Test Park",
        lat: 40.7,
        lng: -74.0,
      } as any);
      expect(result).toEqual(spot);
    });

    it("should throw when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      await expect(storage.createSpot({ name: "Test", lat: 0, lng: 0 } as any)).rejects.toThrow(
        "Database not available"
      );
    });
  });

  describe("getAllSpots", () => {
    it("should return empty array when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      const result = await storage.getAllSpots();
      expect(result).toEqual([]);
    });

    it("should return spots with creator name", async () => {
      const spots = [{ id: 1, name: "Park A", creatorFirstName: "John", creatorLastName: "Doe" }];
      mockDbChain.then = (resolve: any) => Promise.resolve(spots).then(resolve);

      const result = await spotStorage.getAllSpots();
      expect(result).toHaveLength(1);
      expect(result[0].creatorName).toBe("John Doe");
    });

    it("should default creator name to Anonymous", async () => {
      const spots = [{ id: 1, name: "Park B", creatorFirstName: null, creatorLastName: null }];
      mockDbChain.then = (resolve: any) => Promise.resolve(spots).then(resolve);

      const result = await spotStorage.getAllSpots();
      expect(result[0].creatorName).toBe("Anonymous");
    });

    it("should apply filters", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      await spotStorage.getAllSpots({
        city: "LA",
        spotType: "park",
        tier: "gold",
        createdBy: "user-1",
        verified: true,
        limit: 10,
        offset: 20,
      });
      expect(mockDbChain.limit).toHaveBeenCalledWith(10);
      expect(mockDbChain.offset).toHaveBeenCalledWith(20);
    });
  });

  describe("getSpotById", () => {
    it("should return spot by ID", async () => {
      const spot = { id: 1, name: "Park", creatorFirstName: "Jane", creatorLastName: null };
      mockDbChain.then = (resolve: any) => Promise.resolve([spot]).then(resolve);

      const result = await spotStorage.getSpotById(1);
      expect(result).toBeTruthy();
      expect(result!.creatorName).toBe("Jane");
    });

    it("should return null when not found", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const result = await spotStorage.getSpotById(999);
      expect(result).toBeNull();
    });

    it("should return null when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      const result = await storage.getSpotById(1);
      expect(result).toBeNull();
    });
  });

  describe("getSpotsNearLocation", () => {
    it("should return nearby spots", async () => {
      const spots = [{ id: 1, name: "Nearby", creatorFirstName: "X", creatorLastName: "Y" }];
      mockDbChain.then = (resolve: any) => Promise.resolve(spots).then(resolve);

      const result = await spotStorage.getSpotsNearLocation(40.7, -74.0, 50, 10);
      expect(result).toHaveLength(1);
      expect(result[0].creatorName).toBe("X Y");
    });

    it("should return empty when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      const result = await storage.getSpotsNearLocation(0, 0);
      expect(result).toEqual([]);
    });
  });

  describe("updateSpot", () => {
    it("should update and return spot", async () => {
      const updated = { id: 1, name: "Updated Park" };
      mockDbChain.then = (resolve: any) => Promise.resolve([updated]).then(resolve);

      const result = await spotStorage.updateSpot(1, { name: "Updated Park" } as any);
      expect(result).toEqual(updated);
    });

    it("should return null when spot not found", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const result = await spotStorage.updateSpot(999, { name: "X" } as any);
      expect(result).toBeNull();
    });

    it("should throw when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      await expect(storage.updateSpot(1, {} as any)).rejects.toThrow();
    });
  });

  describe("deleteSpot", () => {
    it("should soft-delete spot", async () => {
      const deleted = { id: 1, isActive: false };
      mockDbChain.then = (resolve: any) => Promise.resolve([deleted]).then(resolve);

      const result = await spotStorage.deleteSpot(1);
      expect(result).toBe(true);
    });

    it("should return false when spot not found", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const result = await spotStorage.deleteSpot(999);
      expect(result).toBe(false);
    });

    it("should throw when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      await expect(storage.deleteSpot(1)).rejects.toThrow();
    });
  });

  describe("incrementCheckIn", () => {
    it("should increment check-in count", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve(undefined).then(resolve);
      await spotStorage.incrementCheckIn(1);
      expect(mockDbChain.update).toHaveBeenCalled();
    });

    it("should throw when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      await expect(storage.incrementCheckIn(1)).rejects.toThrow();
    });
  });

  describe("updateRating", () => {
    it("should upsert per-user rating and recompute aggregate", async () => {
      // The new updateRating does four awaits on the chain:
      // 1. select() for spot existence — needs [{ id: number }]
      // 2. insert().values().onConflictDoUpdate() — void
      // 3. select().from().where() for aggregate — needs [{ avgRating, total }]
      // 4. update().set().where() — void
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        // First thenable is spot existence check — return spot ID
        if (callCount === 1) {
          return Promise.resolve([{ id: 1 }]).then(resolve);
        }
        // Third thenable is the aggregate select — return a result row
        if (callCount === 3) {
          return Promise.resolve([{ avgRating: "4", total: 1 }]).then(resolve);
        }
        return Promise.resolve(undefined).then(resolve);
      };
      await spotStorage.updateRating(1, 4, "test-user-id");
      expect(mockDbChain.insert).toHaveBeenCalled();
      expect(mockDbChain.onConflictDoUpdate).toHaveBeenCalled();
      expect(mockDbChain.update).toHaveBeenCalled();
    });

    it("should throw for non-integer rating", async () => {
      await expect(spotStorage.updateRating(1, 4.5, "test-user-id")).rejects.toThrow(
        "Rating must be an integer between 1 and 5"
      );
    });

    it("should throw for rating out of range", async () => {
      await expect(spotStorage.updateRating(1, 6, "test-user-id")).rejects.toThrow(
        "Rating must be an integer between 1 and 5"
      );
      await expect(spotStorage.updateRating(1, 0, "test-user-id")).rejects.toThrow(
        "Rating must be an integer between 1 and 5"
      );
    });

    it("should throw when spot not found", async () => {
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        // First thenable is spot existence check — return empty array (spot not found)
        if (callCount === 1) {
          return Promise.resolve([]).then(resolve);
        }
        return Promise.resolve(undefined).then(resolve);
      };
      await expect(spotStorage.updateRating(1, 4, "test-user-id")).rejects.toThrow(
        "Spot not found"
      );
    });

    it("should throw when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      await expect(storage.updateRating(1, 4, "test-user-id")).rejects.toThrow();
    });
  });

  describe("verifySpot", () => {
    it("should verify spot", async () => {
      const verified = { id: 1, verified: true };
      mockDbChain.then = (resolve: any) => Promise.resolve([verified]).then(resolve);
      const result = await spotStorage.verifySpot(1);
      expect(result).toEqual(verified);
    });

    it("should return null when spot not found", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const result = await spotStorage.verifySpot(999);
      expect(result).toBeNull();
    });

    it("should throw when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      await expect(storage.verifySpot(1)).rejects.toThrow("Database not available");
    });
  });

  describe("getSpotsByUser", () => {
    it("should return user spots", async () => {
      const spots = [{ id: 1, creatorFirstName: "A", creatorLastName: "B" }];
      mockDbChain.then = (resolve: any) => Promise.resolve(spots).then(resolve);
      const result = await spotStorage.getSpotsByUser("user-1");
      expect(result).toHaveLength(1);
      expect(result[0].creatorName).toBe("A B");
    });

    it("should return empty when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      const result = await storage.getSpotsByUser("user-1");
      expect(result).toEqual([]);
    });
  });

  describe("checkDuplicate", () => {
    it("should return true when duplicate exists", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([{ id: 1 }]).then(resolve);
      const result = await spotStorage.checkDuplicate("Test Park", 40.7, -74.0);
      expect(result).toBe(true);
    });

    it("should return false when no duplicate", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const result = await spotStorage.checkDuplicate("New Park", 40.7, -74.0);
      expect(result).toBe(false);
    });

    it("should return false when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      const result = await storage.checkDuplicate("Park", 0, 0);
      expect(result).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return spot statistics", async () => {
      const stats = { total: 100, verified: 50, cities: 25 };
      mockDbChain.then = (resolve: any) => Promise.resolve([stats]).then(resolve);
      const result = await spotStorage.getStats();
      expect(result).toEqual(stats);
    });

    it("should return zeros when db is null", async () => {
      mockDb = null;
      const storage = new SpotStorage();
      const result = await storage.getStats();
      expect(result).toEqual({ total: 0, verified: 0, cities: 0 });
    });
  });
});
