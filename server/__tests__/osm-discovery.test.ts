/**
 * @fileoverview Unit tests for OSM discovery service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

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

vi.mock("../redis", () => ({
  getRedisClient: () => null, // No Redis, use fallback
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { discoverSkateparks, isAreaCached, MIN_RADIUS_METERS, MAX_RADIUS_METERS } =
  await import("../services/osmDiscovery");

// ============================================================================
// Tests
// ============================================================================

describe("OSM Discovery Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isAreaCached", () => {
    it("should return false for uncached area", async () => {
      const result = await isAreaCached(99.99, 99.99);
      expect(result).toBe(false);
    });
  });

  describe("discoverSkateparks", () => {
    it("should parse Overpass API response and return spots", async () => {
      const overpassResponse = {
        elements: [
          {
            type: "node",
            id: 1,
            lat: 40.7128,
            lon: -74.006,
            tags: {
              name: "Brooklyn Skatepark",
              leisure: "skatepark",
              surface: "concrete",
              lit: "yes",
            },
          },
          {
            type: "way",
            id: 2,
            center: { lat: 40.75, lon: -73.99 },
            tags: {
              name: "Chelsea Bowl",
              leisure: "pitch",
              sport: "skateboard",
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(overpassResponse),
      });

      const results = await discoverSkateparks(40.7128, -74.006, 50000);
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe("Brooklyn Skatepark");
      expect(results[0].lat).toBe(40.7128);
      expect(results[0].lng).toBe(-74.006);
      expect(results[0].description).toContain("Surface: concrete");
      expect(results[0].description).toContain("Lit at night");
      expect(results[1].name).toBe("Chelsea Bowl");
      expect(results[1].spotType).toBe("bowl");
    });

    it("should deduplicate by OSM type+id", async () => {
      const overpassResponse = {
        elements: [
          {
            type: "node",
            id: 1,
            lat: 40.7,
            lon: -74.0,
            tags: { name: "Park", leisure: "skatepark" },
          },
          {
            type: "node",
            id: 1,
            lat: 40.7,
            lon: -74.0,
            tags: { name: "Park", leisure: "skatepark" },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(overpassResponse),
      });

      const results = await discoverSkateparks(80.0, 80.0);
      expect(results).toHaveLength(1);
    });

    it("should skip unnamed nodes without leisure tag", async () => {
      const overpassResponse = {
        elements: [
          {
            type: "node",
            id: 3,
            lat: 40.7,
            lon: -74.0,
            tags: { sport: "skateboard" }, // No name, no leisure
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(overpassResponse),
      });

      const results = await discoverSkateparks(70.0, 70.0);
      expect(results).toHaveLength(0);
    });

    it("should skip elements without coordinates", async () => {
      const overpassResponse = {
        elements: [
          {
            type: "relation",
            id: 4,
            tags: { name: "No Coords Park", leisure: "skatepark" },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(overpassResponse),
      });

      const results = await discoverSkateparks(60.0, 60.0);
      expect(results).toHaveLength(0);
    });

    it("should return empty on non-OK response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429 });
      const results = await discoverSkateparks(50.0, 50.0);
      expect(results).toEqual([]);
    });

    it("should return empty on network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));
      const results = await discoverSkateparks(45.0, 45.0);
      expect(results).toEqual([]);
    });

    it("should return empty on abort/timeout", async () => {
      const abortError = new Error("AbortError");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValue(abortError);
      const results = await discoverSkateparks(35.0, 35.0);
      expect(results).toEqual([]);
    });

    it("should return empty for cached area", async () => {
      // First call populates cache
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });
      await discoverSkateparks(10.0, 10.0);

      // Second call should be cached
      const results = await discoverSkateparks(10.0, 10.0);
      expect(results).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only called once
    });

    it("should build description from tags", async () => {
      const overpassResponse = {
        elements: [
          {
            type: "node",
            id: 10,
            lat: 20.0,
            lon: 20.0,
            tags: {
              name: "Test Park",
              leisure: "skatepark",
              description: "Custom description here",
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(overpassResponse),
      });

      const results = await discoverSkateparks(20.0, 20.0);
      expect(results[0].description).toBe("Custom description here");
    });

    it("should build description with free access and opening hours", async () => {
      const overpassResponse = {
        elements: [
          {
            type: "node",
            id: 11,
            lat: 25.0,
            lon: 25.0,
            tags: {
              name: "Free Park",
              leisure: "skatepark",
              fee: "no",
              opening_hours: "24/7",
              wheelchair: "yes",
              covered: "yes",
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(overpassResponse),
      });

      const results = await discoverSkateparks(25.0, 25.0);
      expect(results[0].description).toContain("Free to use");
      expect(results[0].description).toContain("Hours: 24/7");
      expect(results[0].description).toContain("Wheelchair accessible");
      expect(results[0].description).toContain("Covered/indoor");
    });

    it("should build address from tags", async () => {
      const overpassResponse = {
        elements: [
          {
            type: "node",
            id: 12,
            lat: 30.0,
            lon: 30.0,
            tags: {
              name: "Address Park",
              leisure: "skatepark",
              "addr:housenumber": "123",
              "addr:street": "Main St",
              "addr:city": "Los Angeles",
              "addr:state": "CA",
              "addr:country": "US",
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(overpassResponse),
      });

      const results = await discoverSkateparks(30.0, 30.0);
      expect(results[0].address).toBe("123 Main St, Los Angeles, CA");
      expect(results[0].city).toBe("Los Angeles");
      expect(results[0].state).toBe("CA");
      expect(results[0].country).toBe("US");
    });

    it("should infer park spot type from leisure tag", async () => {
      const overpassResponse = {
        elements: [
          {
            type: "node",
            id: 13,
            lat: 55.0,
            lon: 55.0,
            tags: { name: "Leisure Park", leisure: "pitch", sport: "skateboard" },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(overpassResponse),
      });

      const results = await discoverSkateparks(55.0, 55.0);
      expect(results[0].spotType).toBe("park");
    });

    it("should clamp excessively large radius to MAX_RADIUS_METERS", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await discoverSkateparks(15.0, 15.0, 999999);
      const fetchBody = decodeURIComponent(mockFetch.mock.calls[0][1]?.body as string);
      expect(fetchBody).toContain(`around:${MAX_RADIUS_METERS}`);
      expect(fetchBody).not.toContain("around:999999");
    });

    it("should clamp excessively small radius to MIN_RADIUS_METERS", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await discoverSkateparks(16.0, 16.0, 5);
      const fetchBody = decodeURIComponent(mockFetch.mock.calls[0][1]?.body as string);
      expect(fetchBody).toContain(`around:${MIN_RADIUS_METERS}`);
    });

    it("should clamp negative radius to MIN_RADIUS_METERS", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await discoverSkateparks(17.0, 17.0, -500);
      const fetchBody = decodeURIComponent(mockFetch.mock.calls[0][1]?.body as string);
      expect(fetchBody).toContain(`around:${MIN_RADIUS_METERS}`);
    });
  });
});
