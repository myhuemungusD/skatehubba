/**
 * Tests for client/src/lib/demo-data.ts
 *
 * Covers: isDemoSpot helper, DEMO_SPOTS array, DEMO_LEADERBOARD array.
 * Validates structural integrity and data consistency.
 */

import { describe, it, expect } from "vitest";
import { isDemoSpot, DEMO_SPOTS, DEMO_LEADERBOARD } from "../demo-data";

describe("demo-data", () => {
  // ────────────────────────────────────────────────────────────────────────
  // isDemoSpot
  // ────────────────────────────────────────────────────────────────────────

  describe("isDemoSpot", () => {
    it("returns true for negative IDs (demo data)", () => {
      expect(isDemoSpot({ id: -1 })).toBe(true);
      expect(isDemoSpot({ id: -100 })).toBe(true);
      expect(isDemoSpot({ id: -999 })).toBe(true);
    });

    it("returns false for positive IDs (real data)", () => {
      expect(isDemoSpot({ id: 1 })).toBe(false);
      expect(isDemoSpot({ id: 42 })).toBe(false);
      expect(isDemoSpot({ id: 100000 })).toBe(false);
    });

    it("returns false for zero (boundary)", () => {
      expect(isDemoSpot({ id: 0 })).toBe(false);
    });

    it("correctly identifies all DEMO_SPOTS as demo spots", () => {
      for (const spot of DEMO_SPOTS) {
        expect(isDemoSpot(spot)).toBe(true);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // DEMO_SPOTS
  // ────────────────────────────────────────────────────────────────────────

  describe("DEMO_SPOTS", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(DEMO_SPOTS)).toBe(true);
      expect(DEMO_SPOTS.length).toBeGreaterThanOrEqual(5);
    });

    it("has exactly 8 demo spots", () => {
      expect(DEMO_SPOTS).toHaveLength(8);
    });

    it("all IDs are negative", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.id).toBeLessThan(0);
      }
    });

    it("IDs are unique", () => {
      const ids = DEMO_SPOTS.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("IDs are sequential negative integers (-1 through -8)", () => {
      const ids = DEMO_SPOTS.map((s) => s.id).sort((a, b) => a - b);
      expect(ids).toEqual([-8, -7, -6, -5, -4, -3, -2, -1]);
    });

    it("every spot has a non-empty name", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.name).toBeTypeOf("string");
        expect(spot.name.length).toBeGreaterThan(0);
      }
    });

    it("every spot has a non-empty description", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.description).toBeTypeOf("string");
        expect(spot.description!.length).toBeGreaterThan(0);
      }
    });

    it("every spot has a valid spotType", () => {
      const validTypes = ["street", "park", "diy", "ledge", "stairs", "gap", "rail", "bowl"];
      for (const spot of DEMO_SPOTS) {
        expect(validTypes).toContain(spot.spotType);
      }
    });

    it("every spot has a valid tier", () => {
      const validTiers = ["bronze", "silver", "gold", "legendary"];
      for (const spot of DEMO_SPOTS) {
        expect(validTiers).toContain(spot.tier);
      }
    });

    it("every spot has valid coordinates", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.lat).toBeTypeOf("number");
        expect(spot.lng).toBeTypeOf("number");
        expect(spot.lat).toBeGreaterThanOrEqual(-90);
        expect(spot.lat).toBeLessThanOrEqual(90);
        expect(spot.lng).toBeGreaterThanOrEqual(-180);
        expect(spot.lng).toBeLessThanOrEqual(180);
      }
    });

    it("every spot is marked as verified and active", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.verified).toBe(true);
        expect(spot.isActive).toBe(true);
      }
    });

    it("every spot has positive checkInCount and rating", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.checkInCount).toBeGreaterThan(0);
        expect(spot.rating).toBeGreaterThan(0);
        expect(spot.rating).toBeLessThanOrEqual(5);
        expect(spot.ratingCount).toBeGreaterThan(0);
      }
    });

    it("includes iconic spots: Hubba Hideout, MACBA, Venice, Burnside, Southbank", () => {
      const names = DEMO_SPOTS.map((s) => s.name);
      expect(names).toContain("Hubba Hideout");
      expect(names).toContain("MACBA");
      expect(names).toContain("Venice Beach Skatepark");
      expect(names).toContain("Burnside Skatepark");
      expect(names).toContain("Southbank Undercroft");
    });

    it("has an address and city for every spot", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.address).toBeTypeOf("string");
        expect(spot.address!.length).toBeGreaterThan(0);
        expect(spot.city).toBeTypeOf("string");
        expect(spot.city!.length).toBeGreaterThan(0);
      }
    });

    it("every spot has a country", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.country).toBeTypeOf("string");
        expect(spot.country!.length).toBeGreaterThan(0);
      }
    });

    it("has createdAt and updatedAt dates", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.createdAt).toBeInstanceOf(Date);
        expect(spot.updatedAt).toBeInstanceOf(Date);
      }
    });

    it("photoUrl and thumbnailUrl are null (demo data has no media)", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.photoUrl).toBeNull();
        expect(spot.thumbnailUrl).toBeNull();
      }
    });

    it("createdBy is null for demo spots", () => {
      for (const spot of DEMO_SPOTS) {
        expect(spot.createdBy).toBeNull();
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // DEMO_LEADERBOARD
  // ────────────────────────────────────────────────────────────────────────

  describe("DEMO_LEADERBOARD", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(DEMO_LEADERBOARD)).toBe(true);
      expect(DEMO_LEADERBOARD.length).toBeGreaterThanOrEqual(5);
    });

    it("has exactly 10 leaderboard entries", () => {
      expect(DEMO_LEADERBOARD).toHaveLength(10);
    });

    it("IDs are unique", () => {
      const ids = DEMO_LEADERBOARD.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("IDs follow the demo-N pattern", () => {
      for (const entry of DEMO_LEADERBOARD) {
        expect(entry.id).toMatch(/^demo-\d+$/);
      }
    });

    it("every entry has a displayName and username", () => {
      for (const entry of DEMO_LEADERBOARD) {
        expect(entry.displayName).toBeTypeOf("string");
        expect(entry.displayName.length).toBeGreaterThan(0);
        expect(entry.username).toBeTypeOf("string");
        expect(entry.username!.length).toBeGreaterThan(0);
      }
    });

    it("every entry has positive points", () => {
      for (const entry of DEMO_LEADERBOARD) {
        expect(entry.points).toBeTypeOf("number");
        expect(entry.points!).toBeGreaterThan(0);
      }
    });

    it("every entry has positive numeric stats", () => {
      for (const entry of DEMO_LEADERBOARD) {
        expect(entry.totalCheckIns).toBeGreaterThan(0);
        expect(entry.spotsVisited).toBeGreaterThan(0);
        expect(entry.streak).toBeGreaterThan(0);
      }
    });

    it("entries are sorted by rank (ascending)", () => {
      for (let i = 1; i < DEMO_LEADERBOARD.length; i++) {
        expect(DEMO_LEADERBOARD[i].rank!).toBeGreaterThan(DEMO_LEADERBOARD[i - 1].rank!);
      }
    });

    it("ranks are contiguous from 1 to 10", () => {
      const ranks = DEMO_LEADERBOARD.map((e) => e.rank);
      expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it("points are in descending order (higher ranked = more points)", () => {
      for (let i = 1; i < DEMO_LEADERBOARD.length; i++) {
        expect(DEMO_LEADERBOARD[i].points!).toBeLessThan(DEMO_LEADERBOARD[i - 1].points!);
      }
    });

    it("usernames are lowercase versions of displayNames", () => {
      for (const entry of DEMO_LEADERBOARD) {
        expect(entry.username).toBe(entry.displayName.toLowerCase());
      }
    });
  });
});
