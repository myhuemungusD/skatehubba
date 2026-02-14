/**
 * Unit tests for OSM Discovery Service - covering uncovered lines:
 * - Lines 168-171: Redis cache write error (catch in .catch callback)
 * - Line 215: addr:street path without addr:housenumber
 * - Line 226: default "park" type when no leisure tag
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedisClient = vi.hoisted(() => ({
  exists: vi.fn(),
  set: vi.fn(),
}));

const mockGetRedisClient = vi.hoisted(() => vi.fn());

vi.mock("../../redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { discoverSkateparks, isAreaCached } from "../osmDiscovery";
import logger from "../../logger";

describe("osmDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue(null);
  });

  // ==========================================================================
  // Lines 168-171: Redis cache write error
  // ==========================================================================

  describe("Redis cache write error (lines 168-171)", () => {
    it("logs warning when Redis set fails after successful discovery", async () => {
      // First call (isAreaCached) - Redis exists returns 0 (not cached)
      // Second call (cache write) - Redis set rejects
      const redisClient = {
        exists: vi.fn().mockResolvedValue(0),
        set: vi.fn().mockRejectedValue(new Error("Redis WRITE failed")),
      };
      mockGetRedisClient.mockReturnValue(redisClient);

      // Use unique grid cell: (50.0, -50.0)
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 50.0,
              lon: -50.0,
              tags: {
                name: "Brooklyn Banks",
                leisure: "skatepark",
              },
            },
          ],
        }),
      });

      const results = await discoverSkateparks(50.0, -50.0, 5000);

      // Should still return results despite Redis error
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("Brooklyn Banks");

      // The Redis .catch handler should log the warning
      // We need to wait for the promise chain to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(logger.warn).toHaveBeenCalledWith(
        "[OSM] Redis cache write failed",
        expect.objectContaining({ error: "Redis WRITE failed" })
      );
    });

    it("logs warning with non-Error thrown from Redis set", async () => {
      const redisClient = {
        exists: vi.fn().mockResolvedValue(0),
        set: vi.fn().mockRejectedValue("string error"),
      };
      mockGetRedisClient.mockReturnValue(redisClient);

      // Use unique grid cell: (55.0, -55.0)
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          elements: [
            {
              type: "way",
              id: 2,
              center: { lat: 55.0, lon: -55.0 },
              tags: {
                name: "Test Park",
                leisure: "pitch",
                sport: "skateboard",
              },
            },
          ],
        }),
      });

      await discoverSkateparks(55.0, -55.0, 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(logger.warn).toHaveBeenCalledWith(
        "[OSM] Redis cache write failed",
        expect.objectContaining({ error: "string error" })
      );
    });
  });

  // ==========================================================================
  // Line 215: addr:street path (without housenumber)
  // ==========================================================================

  describe("buildAddress - addr:street without housenumber (line 215)", () => {
    it("uses addr:street alone when addr:housenumber is missing", async () => {
      mockGetRedisClient.mockReturnValue(null);

      // Use unique coordinates that map to a unique grid cell (grid size = 0.25)
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          elements: [
            {
              type: "node",
              id: 3,
              lat: 10.0,
              lon: -10.0,
              tags: {
                name: "LA Skatepark",
                leisure: "skatepark",
                "addr:street": "Venice Boulevard",
                "addr:city": "Los Angeles",
                "addr:state": "CA",
              },
            },
          ],
        }),
      });

      const results = await discoverSkateparks(10.0, -10.0, 5000);

      expect(results.length).toBe(1);
      // addr:street without housenumber -> just the street name
      expect(results[0].address).toBe("Venice Boulevard, Los Angeles, CA");
    });

    it("uses housenumber + street when both are present", async () => {
      mockGetRedisClient.mockReturnValue(null);

      // Different unique grid cell
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          elements: [
            {
              type: "node",
              id: 4,
              lat: 15.0,
              lon: -15.0,
              tags: {
                name: "Numbered Park",
                leisure: "skatepark",
                "addr:housenumber": "123",
                "addr:street": "Main Street",
                "addr:city": "Springfield",
              },
            },
          ],
        }),
      });

      const results = await discoverSkateparks(15.0, -15.0, 5000);

      expect(results.length).toBe(1);
      expect(results[0].address).toBe("123 Main Street, Springfield");
    });
  });

  // ==========================================================================
  // Line 226: default park type when no recognizable leisure tag
  // ==========================================================================

  describe("inferSpotType - default park type (line 226)", () => {
    it("returns 'park' when no leisure tag matches known types", async () => {
      mockGetRedisClient.mockReturnValue(null);

      // Unique grid cell
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          elements: [
            {
              type: "node",
              id: 5,
              lat: 20.0,
              lon: -20.0,
              tags: {
                name: "Mystery Spot",
                // No 'leisure' tag at all, and name doesn't contain 'bowl'
                sport: "skateboard",
                surface: "concrete",
              },
            },
          ],
        }),
      });

      // This element has sport=skateboard but no leisure tag.
      // The filter at line 149 skips unnamed nodes without leisure.
      // But this one IS named, so it passes.
      // inferSpotType will fall through to default "park" at line 226.
      const results = await discoverSkateparks(20.0, -20.0, 5000);

      expect(results.length).toBe(1);
      expect(results[0].spotType).toBe("park");
    });

    it("returns 'bowl' when name contains 'bowl'", async () => {
      mockGetRedisClient.mockReturnValue(null);

      // Different unique grid cell
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          elements: [
            {
              type: "node",
              id: 6,
              lat: 25.0,
              lon: -25.0,
              tags: {
                name: "Burnside Bowl",
                leisure: "skatepark",
              },
            },
          ],
        }),
      });

      const results = await discoverSkateparks(25.0, -25.0, 5000);

      expect(results.length).toBe(1);
      expect(results[0].spotType).toBe("bowl");
    });
  });

  // ==========================================================================
  // isAreaCached - Redis cache check failure (lines 64-68)
  // ==========================================================================

  describe("isAreaCached - Redis check failure fallback", () => {
    it("falls back to memory cache when Redis exists fails", async () => {
      const redisClient = {
        exists: vi.fn().mockRejectedValue(new Error("Redis DOWN")),
      };
      mockGetRedisClient.mockReturnValue(redisClient);

      // Use unique grid cell coordinates: (60.0, -60.0)
      const cached = await isAreaCached(60.0, -60.0);
      expect(cached).toBe(false);

      expect(logger.warn).toHaveBeenCalledWith(
        "[OSM] Redis cache check failed, falling back to memory",
        expect.objectContaining({ error: "Redis DOWN" })
      );
    });
  });
});
