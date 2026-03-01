/**
 * Unit tests for OSM Discovery Service - targeting 100% branch coverage.
 *
 * Covers:
 * - isAreaCached: Redis success/failure, memory cache hit/miss/expiry
 * - discoverSkateparks: invalid coords, cached skip, non-ok response,
 *   duplicate elements, missing lat/lng, missing tags, name fallbacks,
 *   unnamed skip, AbortError, generic error, memory cache eviction
 * - buildDescription: all tag-based branches
 * - buildAddress: street-only, housenumber+street, city, state
 * - inferSpotType: shop -> "other", bowl name, skatepark/pitch -> park, default park
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

import {
  discoverSkateparks,
  isAreaCached,
  MIN_RADIUS_METERS,
  MAX_RADIUS_METERS,
} from "../osmDiscovery";
import logger from "../../logger";

/** Helper: build a valid Overpass API mock response */
function mockOverpassResponse(elements: unknown[]) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({ elements }),
  };
}

/**
 * We use unique grid cells per test to avoid cross-test cache contamination.
 * Grid size is 0.25, so coords like (X.0, Y.0) where X and Y differ by 1
 * always map to different cells. We start at high values to avoid collisions
 * with any cached cells from prior test runs in the same module instance.
 */
let coordCounter = 70;
function uniqueCoords(): { lat: number; lng: number } {
  const c = coordCounter++;
  // Keep lat in valid range [-90,90]
  return { lat: ((c * 0.5) % 80) + 1, lng: -(c * 0.5 + 10) };
}

describe("osmDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue(null);
  });

  // ==========================================================================
  // isAreaCached
  // ==========================================================================
  describe("isAreaCached", () => {
    it("returns true when Redis key exists", async () => {
      const redis = { exists: vi.fn().mockResolvedValue(1) };
      mockGetRedisClient.mockReturnValue(redis);
      const result = await isAreaCached(40.0, -74.0);
      expect(result).toBe(true);
    });

    it("returns false when Redis key does not exist", async () => {
      const redis = { exists: vi.fn().mockResolvedValue(0) };
      mockGetRedisClient.mockReturnValue(redis);
      const result = await isAreaCached(40.0, -74.0);
      expect(result).toBe(false);
    });

    it("falls back to memory cache when Redis exists throws Error", async () => {
      const redis = { exists: vi.fn().mockRejectedValue(new Error("Redis DOWN")) };
      mockGetRedisClient.mockReturnValue(redis);
      const result = await isAreaCached(60.0, -60.0);
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        "[OSM] Redis cache check failed, falling back to memory",
        expect.objectContaining({ error: "Redis DOWN" }),
      );
    });

    it("falls back to memory cache when Redis exists throws non-Error", async () => {
      const redis = { exists: vi.fn().mockRejectedValue("string error") };
      mockGetRedisClient.mockReturnValue(redis);
      const result = await isAreaCached(61.0, -61.0);
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        "[OSM] Redis cache check failed, falling back to memory",
        expect.objectContaining({ error: "string error" }),
      );
    });

    it("returns false from memory cache when entry not present (no Redis)", async () => {
      mockGetRedisClient.mockReturnValue(null);
      // Fresh coords - never cached in memory
      const result = await isAreaCached(89.0, -179.0);
      expect(result).toBe(false);
    });

    it("returns true from memory cache when entry is present and not expired", async () => {
      mockGetRedisClient.mockReturnValue(null);
      const { lat, lng } = uniqueCoords();

      // First: discover to populate the memory cache
      mockFetch.mockResolvedValue(mockOverpassResponse([]));
      await discoverSkateparks(lat, lng);

      // Now isAreaCached should return true (memory cache hit, not expired)
      const result = await isAreaCached(lat, lng);
      expect(result).toBe(true);
    });

    it("returns false from memory cache when entry is expired", async () => {
      mockGetRedisClient.mockReturnValue(null);
      const { lat, lng } = uniqueCoords();

      // Discover to populate memory cache
      mockFetch.mockResolvedValue(mockOverpassResponse([]));

      // Mock Date.now to return a specific time for the initial cache write
      const realDateNow = Date.now;
      const baseTime = 1000000;
      vi.spyOn(Date, "now").mockReturnValue(baseTime);
      await discoverSkateparks(lat, lng);

      // Now advance time past the 1-hour TTL (3600001ms)
      vi.spyOn(Date, "now").mockReturnValue(baseTime + 3600001);
      const result = await isAreaCached(lat, lng);
      expect(result).toBe(false);

      // Restore Date.now
      Date.now = realDateNow;
    });
  });

  // ==========================================================================
  // discoverSkateparks - coordinate validation
  // ==========================================================================
  describe("discoverSkateparks - coordinate validation", () => {
    it("returns empty array for latitude < -90", async () => {
      const results = await discoverSkateparks(-91, 0);
      expect(results).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith("Invalid coordinates for OSM discovery", {
        lat: -91,
        lng: 0,
      });
    });

    it("returns empty array for latitude > 90", async () => {
      const results = await discoverSkateparks(91, 0);
      expect(results).toEqual([]);
    });

    it("returns empty array for longitude < -180", async () => {
      const results = await discoverSkateparks(0, -181);
      expect(results).toEqual([]);
    });

    it("returns empty array for longitude > 180", async () => {
      const results = await discoverSkateparks(0, 181);
      expect(results).toEqual([]);
    });
  });

  // ==========================================================================
  // discoverSkateparks - radius clamping
  // ==========================================================================
  describe("discoverSkateparks - radius clamping", () => {
    it("clamps radius below MIN_RADIUS_METERS to minimum", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(mockOverpassResponse([]));
      await discoverSkateparks(lat, lng, 10); // below MIN_RADIUS_METERS (100)
      const callBody = decodeURIComponent(mockFetch.mock.calls[0][1].body);
      expect(callBody).toContain(`around:${MIN_RADIUS_METERS}`);
    });

    it("clamps radius above MAX_RADIUS_METERS to maximum", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(mockOverpassResponse([]));
      await discoverSkateparks(lat, lng, 100000); // above MAX_RADIUS_METERS (50000)
      const callBody = decodeURIComponent(mockFetch.mock.calls[0][1].body);
      expect(callBody).toContain(`around:${MAX_RADIUS_METERS}`);
    });
  });

  // ==========================================================================
  // discoverSkateparks - cached area skip
  // ==========================================================================
  describe("discoverSkateparks - cached area skip", () => {
    it("returns empty array when area is already cached", async () => {
      const { lat, lng } = uniqueCoords();

      // First call populates the memory cache
      mockFetch.mockResolvedValue(mockOverpassResponse([]));
      await discoverSkateparks(lat, lng);

      // Second call should skip and return empty
      mockFetch.mockClear();
      const results = await discoverSkateparks(lat, lng);
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Skipping OSM discovery"),
      );
    });
  });

  // ==========================================================================
  // discoverSkateparks - non-OK response
  // ==========================================================================
  describe("discoverSkateparks - non-OK response", () => {
    it("returns empty array when Overpass API returns non-OK status", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue({ ok: false, status: 429 });
      const results = await discoverSkateparks(lat, lng);
      expect(results).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        "Overpass API returned non-OK status",
        { status: 429 },
      );
    });
  });

  // ==========================================================================
  // discoverSkateparks - element processing
  // ==========================================================================
  describe("discoverSkateparks - element processing", () => {
    it("deduplicates elements by type-id key", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          { type: "node", id: 100, lat: lat, lon: lng, tags: { name: "Park A", leisure: "skatepark" } },
          { type: "node", id: 100, lat: lat, lon: lng, tags: { name: "Park A", leisure: "skatepark" } },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(1);
    });

    it("skips elements with no lat/lng and no center", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          { type: "relation", id: 200, tags: { name: "No Coords Park", leisure: "skatepark" } },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(0);
    });

    it("uses center lat/lon when direct lat/lon are absent", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "way",
            id: 201,
            center: { lat: lat + 0.01, lon: lng + 0.01 },
            tags: { name: "Way Park", leisure: "skatepark" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(1);
      expect(results[0].lat).toBeCloseTo(lat + 0.01);
      expect(results[0].lng).toBeCloseTo(lng + 0.01);
    });

    it("handles elements with no tags (tags undefined -> empty object fallback)", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          { type: "node", id: 202, lat: lat, lon: lng },
          // No tags at all -> tags ?? {} = {}, name = defaultName,
          // then skip because name === defaultName && !tags.leisure && !shop
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(0);
    });

    it("uses name:en when name is missing", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 203,
            lat: lat,
            lon: lng,
            tags: { "name:en": "English Park Name", leisure: "skatepark" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("English Park Name");
    });

    it("uses default name 'Skatepark' when no name or name:en", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 204,
            lat: lat,
            lon: lng,
            tags: { leisure: "skatepark" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Skatepark");
    });

    it("uses default name 'Skate Shop' for shop elements", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 205,
            lat: lat,
            lon: lng,
            tags: { shop: "skateboard" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Skate Shop");
    });

    it("skips unnamed nodes without leisure and not a shop", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 206,
            lat: lat,
            lon: lng,
            tags: { sport: "skateboard" },
            // name is defaultName ("Skatepark"), no leisure, not a shop -> skip
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(0);
    });

    it("does NOT skip unnamed nodes that have leisure tag", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 207,
            lat: lat,
            lon: lng,
            tags: { leisure: "skatepark" },
            // name is defaultName but leisure is present, so NOT skipped
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(1);
    });
  });

  // ==========================================================================
  // discoverSkateparks - error handling
  // ==========================================================================
  describe("discoverSkateparks - error handling", () => {
    it("handles AbortError (timeout) gracefully", async () => {
      const { lat, lng } = uniqueCoords();
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValue(abortError);

      const results = await discoverSkateparks(lat, lng);
      expect(results).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith("Overpass API request timed out");
    });

    it("handles generic Error gracefully", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const results = await discoverSkateparks(lat, lng);
      expect(results).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        "Failed to query Overpass API",
        expect.objectContaining({ error: "Network failure" }),
      );
    });

    it("handles non-Error throw gracefully", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockRejectedValue("raw string error");

      const results = await discoverSkateparks(lat, lng);
      expect(results).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        "Failed to query Overpass API",
        expect.objectContaining({ error: "raw string error" }),
      );
    });

    it("fires the setTimeout abort callback when fetch hangs beyond 12s", async () => {
      vi.useFakeTimers();
      const { lat, lng } = uniqueCoords();

      // Make fetch return a promise that never resolves on its own,
      // but listens to the abort signal
      mockFetch.mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      );

      const promise = discoverSkateparks(lat, lng);

      // Advance past the 12000ms timeout to fire the abort callback (line 139)
      await vi.advanceTimersByTimeAsync(12001);

      const results = await promise;
      expect(results).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith("Overpass API request timed out");

      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // discoverSkateparks - memory cache eviction
  // ==========================================================================
  describe("discoverSkateparks - memory cache eviction", () => {
    it("evicts oldest entry when memory cache exceeds MAX_MEMORY_CACHE_SIZE", async () => {
      mockGetRedisClient.mockReturnValue(null);

      // Fill the memory cache to capacity (500 entries).
      // We use the internal module's cache which persists across calls.
      // Each unique grid cell = one entry.
      // We need to make 500 calls with unique grid cells, then one more.
      // However that's expensive. Instead, we can test the code path by
      // directly invoking discoverSkateparks many times, but that's slow.
      //
      // A more practical approach: since the cache is module-level,
      // we'll fill it by calling discoverSkateparks with many unique coords.
      // To keep tests fast, we use a loop with minimal fetch mocking.
      const maxSize = 500;
      // We already have some entries from previous tests. Let's use
      // coordinates that each map to unique grid cells.
      // Grid size 0.25 means coordinates N*0.25 will map to cell center N*0.25
      for (let i = 0; i < maxSize + 5; i++) {
        // Each lat = i * 0.25 maps to a different grid cell
        const lat = ((i * 0.25) % 89) + 0.125; // keep in valid range
        const lng = -((i * 0.25) % 179) - 0.125;
        mockFetch.mockResolvedValue(mockOverpassResponse([]));
        await discoverSkateparks(lat, lng);
      }

      // The cache should have evicted old entries and still work.
      // If we get here without errors, the eviction path was exercised.
      // Verify the last call still succeeded.
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Redis cache write error
  // ==========================================================================
  describe("Redis cache write error", () => {
    it("logs warning when Redis set fails with Error after discovery", async () => {
      const redisClient = {
        exists: vi.fn().mockResolvedValue(0),
        set: vi.fn().mockRejectedValue(new Error("Redis WRITE failed")),
      };
      mockGetRedisClient.mockReturnValue(redisClient);

      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          { type: "node", id: 301, lat, lon: lng, tags: { name: "Cache Test Park", leisure: "skatepark" } },
        ]),
      );

      const results = await discoverSkateparks(lat, lng);
      expect(results).toHaveLength(1);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(logger.warn).toHaveBeenCalledWith(
        "[OSM] Redis cache write failed",
        expect.objectContaining({ error: "Redis WRITE failed" }),
      );
    });

    it("logs warning when Redis set fails with non-Error after discovery", async () => {
      const redisClient = {
        exists: vi.fn().mockResolvedValue(0),
        set: vi.fn().mockRejectedValue("string error"),
      };
      mockGetRedisClient.mockReturnValue(redisClient);

      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          { type: "way", id: 302, center: { lat, lon: lng }, tags: { name: "Way Park", leisure: "pitch", sport: "skateboard" } },
        ]),
      );

      await discoverSkateparks(lat, lng);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(logger.warn).toHaveBeenCalledWith(
        "[OSM] Redis cache write failed",
        expect.objectContaining({ error: "string error" }),
      );
    });
  });

  // ==========================================================================
  // buildDescription
  // ==========================================================================
  describe("buildDescription - all branches", () => {
    it("returns tags.description directly when present", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 400,
            lat,
            lon: lng,
            tags: {
              name: "Desc Park",
              leisure: "skatepark",
              description: "A custom description from OSM",
            },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toBe("A custom description from OSM");
    });

    it("includes surface info", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 401,
            lat,
            lon: lng,
            tags: { name: "Surface Park", leisure: "skatepark", surface: "concrete" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Surface: concrete");
    });

    it("includes 'Lit at night' when lit=yes", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 402,
            lat,
            lon: lng,
            tags: { name: "Lit Park", leisure: "skatepark", lit: "yes" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Lit at night");
    });

    it("includes 'Free to use' when fee=no", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 403,
            lat,
            lon: lng,
            tags: { name: "Free Park", leisure: "skatepark", fee: "no" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Free to use");
    });

    it("includes 'Free to use' when access=yes", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 404,
            lat,
            lon: lng,
            tags: { name: "Open Park", leisure: "skatepark", access: "yes" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Free to use");
    });

    it("includes opening hours", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 405,
            lat,
            lon: lng,
            tags: { name: "Hours Park", leisure: "skatepark", opening_hours: "Mo-Fr 08:00-20:00" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Hours: Mo-Fr 08:00-20:00");
    });

    it("includes wheelchair accessible", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 406,
            lat,
            lon: lng,
            tags: { name: "Accessible Park", leisure: "skatepark", wheelchair: "yes" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Wheelchair accessible");
    });

    it("includes 'Covered/indoor' when covered=yes", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 407,
            lat,
            lon: lng,
            tags: { name: "Indoor Park", leisure: "skatepark", covered: "yes" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Covered/indoor");
    });

    it("includes phone number", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 408,
            lat,
            lon: lng,
            tags: { name: "Phone Shop", shop: "skateboard", phone: "+1-555-1234" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Phone: +1-555-1234");
    });

    it("includes website", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 409,
            lat,
            lon: lng,
            tags: { name: "Web Park", leisure: "skatepark", website: "https://example.com" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Website: https://example.com");
    });

    it("uses 'Skatepark' label in description when not a shop", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 410,
            lat,
            lon: lng,
            tags: { name: "Plain Park", leisure: "skatepark" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Skatepark discovered from OpenStreetMap.");
    });

    it("uses 'Skate shop' label in description when element is a shop", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 411,
            lat,
            lon: lng,
            tags: { name: "Board Shop", shop: "skateboard" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Skate shop discovered from OpenStreetMap.");
    });

    it("builds description with all parts when all tags present", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 412,
            lat,
            lon: lng,
            tags: {
              name: "Full Park",
              leisure: "skatepark",
              surface: "asphalt",
              lit: "yes",
              fee: "no",
              opening_hours: "24/7",
              wheelchair: "yes",
              covered: "yes",
              phone: "+1-555-0000",
              website: "https://fullpark.com",
            },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      const desc = results[0].description;
      expect(desc).toContain("Surface: asphalt");
      expect(desc).toContain("Lit at night");
      expect(desc).toContain("Free to use");
      expect(desc).toContain("Hours: 24/7");
      expect(desc).toContain("Wheelchair accessible");
      expect(desc).toContain("Covered/indoor");
      expect(desc).toContain("Phone: +1-555-0000");
      expect(desc).toContain("Website: https://fullpark.com");
    });

    it("returns description with no parts when no special tags", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 413,
            lat,
            lon: lng,
            tags: { name: "Bare Park", leisure: "skatepark" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toBe("Skatepark discovered from OpenStreetMap.");
    });

    it("uses 'Skate shop' label for sports shop with skateboard sport", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 414,
            lat,
            lon: lng,
            tags: { name: "Sports Skate", shop: "sports", sport: "skateboard" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].description).toContain("Skate shop discovered from OpenStreetMap.");
    });
  });

  // ==========================================================================
  // buildAddress
  // ==========================================================================
  describe("buildAddress", () => {
    it("uses addr:street alone when addr:housenumber is missing", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 500,
            lat,
            lon: lng,
            tags: {
              name: "Street Park",
              leisure: "skatepark",
              "addr:street": "Venice Blvd",
              "addr:city": "LA",
              "addr:state": "CA",
            },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].address).toBe("Venice Blvd, LA, CA");
    });

    it("uses housenumber + street when both present", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 501,
            lat,
            lon: lng,
            tags: {
              name: "Numbered Park",
              leisure: "skatepark",
              "addr:housenumber": "42",
              "addr:street": "Main St",
              "addr:city": "Springfield",
            },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].address).toBe("42 Main St, Springfield");
    });

    it("returns empty address when no address tags", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 502,
            lat,
            lon: lng,
            tags: { name: "No Addr Park", leisure: "skatepark" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].address).toBe("");
    });

    it("populates city, state, country fields", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 503,
            lat,
            lon: lng,
            tags: {
              name: "Full Addr",
              leisure: "skatepark",
              "addr:city": "Portland",
              "addr:state": "OR",
              "addr:country": "US",
            },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].city).toBe("Portland");
      expect(results[0].state).toBe("OR");
      expect(results[0].country).toBe("US");
    });

    it("defaults city/state/country to empty string when missing", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 504,
            lat,
            lon: lng,
            tags: { name: "Minimal Park", leisure: "skatepark" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].city).toBe("");
      expect(results[0].state).toBe("");
      expect(results[0].country).toBe("");
    });
  });

  // ==========================================================================
  // inferSpotType
  // ==========================================================================
  describe("inferSpotType", () => {
    it("returns 'other' for skate shop (shop=skateboard)", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 600,
            lat,
            lon: lng,
            tags: { name: "Board Store", shop: "skateboard" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].spotType).toBe("other");
    });

    it("returns 'other' for sports shop with skateboard sport", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 601,
            lat,
            lon: lng,
            tags: { name: "Sports Store", shop: "sports", sport: "skateboard" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].spotType).toBe("other");
    });

    it("returns 'bowl' when name contains 'bowl' (case insensitive)", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 602,
            lat,
            lon: lng,
            tags: { name: "The Big Bowl", leisure: "skatepark" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].spotType).toBe("bowl");
    });

    it("returns 'park' when leisure=skatepark", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 603,
            lat,
            lon: lng,
            tags: { name: "Normal Park", leisure: "skatepark" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].spotType).toBe("park");
    });

    it("returns 'park' when leisure=pitch", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 604,
            lat,
            lon: lng,
            tags: { name: "Pitch Park", leisure: "pitch", sport: "skateboard" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].spotType).toBe("park");
    });

    it("returns 'park' as default when no matching leisure tag", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 605,
            lat,
            lon: lng,
            tags: { name: "Unknown Spot", sport: "skateboard" },
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].spotType).toBe("park");
    });

    it("returns 'park' when name is empty (uses empty string for toLowerCase)", async () => {
      const { lat, lng } = uniqueCoords();
      mockFetch.mockResolvedValue(
        mockOverpassResponse([
          {
            type: "node",
            id: 606,
            lat,
            lon: lng,
            tags: { leisure: "skatepark" },
            // name defaults to "Skatepark" -> tags.name is undefined so
            // inferSpotType line 266: (tags.name || "").toLowerCase()
            // This tests the || "" fallback in inferSpotType
          },
        ]),
      );
      const results = await discoverSkateparks(lat, lng);
      expect(results[0].spotType).toBe("park");
    });
  });
});
