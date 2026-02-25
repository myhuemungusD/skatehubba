/**
 * Tests for client/src/lib/game/trickDictionary.ts
 *
 * Covers: TRICK_DICTIONARY contents, searchTricks filtering / limiting.
 */

import { describe, it, expect } from "vitest";
import { TRICK_DICTIONARY, searchTricks } from "../trickDictionary";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("TRICK_DICTIONARY", () => {
  it("has entries", () => {
    expect(TRICK_DICTIONARY.length).toBeGreaterThan(0);
  });

  it("contains well-known tricks", () => {
    const dict = [...TRICK_DICTIONARY];
    expect(dict).toContain("Kickflip");
    expect(dict).toContain("Heelflip");
    expect(dict).toContain("Ollie");
    expect(dict).toContain("Impossible");
    expect(dict).toContain("50-50 Grind");
    expect(dict).toContain("Boardslide");
    expect(dict).toContain("Manual");
  });

  it("contains only strings", () => {
    for (const trick of TRICK_DICTIONARY) {
      expect(typeof trick).toBe("string");
    }
  });

  it("contains no duplicates", () => {
    const unique = new Set(TRICK_DICTIONARY);
    expect(unique.size).toBe(TRICK_DICTIONARY.length);
  });
});

describe("searchTricks", () => {
  // ── Empty / whitespace queries ──────────────────────────────────────────

  it("returns empty array for empty query", () => {
    expect(searchTricks("")).toEqual([]);
  });

  it("returns empty array for whitespace-only query", () => {
    expect(searchTricks("   ")).toEqual([]);
  });

  // ── Prefix / case-insensitive matching ──────────────────────────────────

  it("finds tricks by prefix match (case-insensitive)", () => {
    const results = searchTricks("kick");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.toLowerCase()).toContain("kick");
    }
  });

  it("is case-insensitive (uppercase query)", () => {
    const results = searchTricks("KICKFLIP");
    expect(results).toContain("Kickflip");
  });

  it("is case-insensitive (mixed case query)", () => {
    const results = searchTricks("oLLiE", 100);
    expect(results).toContain("Ollie");
    for (const r of results) {
      expect(r.toLowerCase()).toContain("ollie");
    }
  });

  // ── Partial / substring matching ────────────────────────────────────────

  it("finds partial matches ('flip' matches Kickflip, Heelflip, etc.)", () => {
    const results = searchTricks("flip");
    expect(results.length).toBeGreaterThan(1);
    expect(results).toContain("Kickflip");
    expect(results).toContain("Heelflip");
    for (const r of results) {
      expect(r.toLowerCase()).toContain("flip");
    }
  });

  it("finds tricks containing 'grind'", () => {
    const results = searchTricks("grind");
    expect(results.length).toBeGreaterThan(0);
    expect(results).toContain("50-50 Grind");
    for (const r of results) {
      expect(r.toLowerCase()).toContain("grind");
    }
  });

  // ── Limit parameter ────────────────────────────────────────────────────

  it("limits results to default limit of 8", () => {
    // "flip" matches many tricks; default limit should cap at 8
    const results = searchTricks("flip");
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it("limits results to custom limit parameter", () => {
    const results = searchTricks("flip", 3);
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns all matches when limit exceeds total matches", () => {
    const results = searchTricks("Ollie", 100);
    // There are multiple ollie variations but not 100
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(100);
  });

  it("respects limit of 1", () => {
    const results = searchTricks("kick", 1);
    expect(results).toHaveLength(1);
  });

  // ── Nonsense queries ───────────────────────────────────────────────────

  it("returns empty array for nonsense queries", () => {
    expect(searchTricks("zzzzxyzzy")).toEqual([]);
    expect(searchTricks("asdfqwer1234")).toEqual([]);
    expect(searchTricks("!!!")).toEqual([]);
  });
});
