import { describe, it, expect } from "vitest";
import { TRICK_DICTIONARY, searchTricks } from "../trickDictionary";

describe("trickDictionary", () => {
  describe("TRICK_DICTIONARY", () => {
    it("exports a non-empty array", () => {
      expect(Array.isArray(TRICK_DICTIONARY)).toBe(true);
      expect(TRICK_DICTIONARY.length).toBeGreaterThan(0);
    });

    it("contains no duplicates", () => {
      const set = new Set(TRICK_DICTIONARY);
      expect(set.size).toBe(TRICK_DICTIONARY.length);
    });

    it("all entries are non-empty strings", () => {
      for (const trick of TRICK_DICTIONARY) {
        expect(typeof trick).toBe("string");
        expect(trick.length).toBeGreaterThan(0);
      }
    });

    it("contains expected fundamental tricks", () => {
      expect(TRICK_DICTIONARY).toContain("Kickflip");
      expect(TRICK_DICTIONARY).toContain("Ollie");
      expect(TRICK_DICTIONARY).toContain("Heelflip");
    });
  });

  describe("searchTricks", () => {
    it("returns empty array for empty query", () => {
      expect(searchTricks("")).toEqual([]);
      expect(searchTricks("   ")).toEqual([]);
    });

    it("finds tricks by prefix", () => {
      const results = searchTricks("Kick");
      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain("Kickflip");
    });

    it("is case-insensitive", () => {
      const results = searchTricks("kickflip");
      expect(results).toContain("Kickflip");
    });

    it("respects limit parameter", () => {
      const results = searchTricks("flip", 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("returns empty for non-matching query", () => {
      expect(searchTricks("zzzzxyz")).toEqual([]);
    });

    it("matches substring (not just prefix)", () => {
      const results = searchTricks("slide");
      expect(results.length).toBeGreaterThan(0);
      // Should find Boardslide, Lipslide, etc.
    });
  });
});
