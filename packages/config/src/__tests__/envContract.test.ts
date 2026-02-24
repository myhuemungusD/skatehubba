/**
 * Tests for envContract.ts
 *
 * Covers:
 * - Helper functions (isCanonicalPrefix, detectPrefixMismatch, validatePublicEnv)
 * - Contract integrity (all REQUIRED vars must have EXPO_PUBLIC_ prefix)
 * - Sync check: verify-public-env.mjs REQUIRED_KEYS must match the contract
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_PUBLIC_VARS,
  OPTIONAL_PUBLIC_VARS,
  ALL_PUBLIC_VARS,
  isCanonicalPrefix,
  detectPrefixMismatch,
  validatePublicEnv,
} from "../envContract";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("envContract", () => {
  // ── Contract integrity ────────────────────────────────────────────────

  it("all REQUIRED_PUBLIC_VARS use EXPO_PUBLIC_ prefix", () => {
    for (const name of REQUIRED_PUBLIC_VARS) {
      expect(name).toMatch(/^EXPO_PUBLIC_/);
    }
  });

  it("all OPTIONAL_PUBLIC_VARS use EXPO_PUBLIC_ prefix", () => {
    for (const name of OPTIONAL_PUBLIC_VARS) {
      expect(name).toMatch(/^EXPO_PUBLIC_/);
    }
  });

  it("ALL_PUBLIC_VARS is the union of required + optional", () => {
    const expected = [...REQUIRED_PUBLIC_VARS, ...OPTIONAL_PUBLIC_VARS];
    expect([...ALL_PUBLIC_VARS]).toEqual(expected);
  });

  it("no duplicates in ALL_PUBLIC_VARS", () => {
    const unique = new Set(ALL_PUBLIC_VARS);
    expect(unique.size).toBe(ALL_PUBLIC_VARS.length);
  });

  // ── isCanonicalPrefix ─────────────────────────────────────────────────

  describe("isCanonicalPrefix", () => {
    it("returns true for EXPO_PUBLIC_ prefix", () => {
      expect(isCanonicalPrefix("EXPO_PUBLIC_FOO")).toBe(true);
    });

    it("returns false for VITE_ prefix", () => {
      expect(isCanonicalPrefix("VITE_FOO")).toBe(false);
    });

    it("returns false for unprefixed", () => {
      expect(isCanonicalPrefix("DATABASE_URL")).toBe(false);
    });
  });

  // ── detectPrefixMismatch ──────────────────────────────────────────────

  describe("detectPrefixMismatch", () => {
    it("detects VITE_ prefix for a known var", () => {
      const result = detectPrefixMismatch("VITE_FIREBASE_API_KEY");
      expect(result).toEqual({
        expected: "EXPO_PUBLIC_FIREBASE_API_KEY",
        prefix: "VITE_",
      });
    });

    it("detects NEXT_PUBLIC_ prefix for a known var", () => {
      const result = detectPrefixMismatch("NEXT_PUBLIC_SENTRY_DSN");
      expect(result).toEqual({
        expected: "EXPO_PUBLIC_SENTRY_DSN",
        prefix: "NEXT_PUBLIC_",
      });
    });

    it("detects REACT_APP_ prefix for a known var", () => {
      const result = detectPrefixMismatch("REACT_APP_FIREBASE_API_KEY");
      expect(result).toEqual({
        expected: "EXPO_PUBLIC_FIREBASE_API_KEY",
        prefix: "REACT_APP_",
      });
    });

    it("returns null for unknown VITE_ var", () => {
      expect(detectPrefixMismatch("VITE_UNKNOWN_THING")).toBeNull();
    });

    it("returns null for canonical prefix", () => {
      expect(detectPrefixMismatch("EXPO_PUBLIC_FIREBASE_API_KEY")).toBeNull();
    });

    it("returns null for unprefixed var", () => {
      expect(detectPrefixMismatch("DATABASE_URL")).toBeNull();
    });
  });

  // ── validatePublicEnv ─────────────────────────────────────────────────

  describe("validatePublicEnv", () => {
    it("returns empty arrays when all required vars are set", () => {
      const env: Record<string, string> = {};
      for (const name of REQUIRED_PUBLIC_VARS) {
        env[name] = "some-value";
      }
      const result = validatePublicEnv(env);
      expect(result.missing).toHaveLength(0);
      expect(result.mismatched).toHaveLength(0);
    });

    it("reports missing required vars", () => {
      const result = validatePublicEnv({});
      expect(result.missing).toEqual([...REQUIRED_PUBLIC_VARS]);
    });

    it("treats whitespace-only values as missing", () => {
      const env: Record<string, string> = {};
      for (const name of REQUIRED_PUBLIC_VARS) {
        env[name] = "   ";
      }
      const result = validatePublicEnv(env);
      expect(result.missing).toEqual([...REQUIRED_PUBLIC_VARS]);
    });

    it("detects mismatched prefixes in the provided env", () => {
      const result = validatePublicEnv({
        VITE_FIREBASE_API_KEY: "some-key",
      });
      expect(result.mismatched).toEqual([
        { found: "VITE_FIREBASE_API_KEY", expected: "EXPO_PUBLIC_FIREBASE_API_KEY" },
      ]);
    });

    it("ignores unknown VITE_ vars (not in contract)", () => {
      const result = validatePublicEnv({
        VITE_SOME_RANDOM_THING: "value",
      });
      expect(result.mismatched).toHaveLength(0);
    });
  });

  // ── Sync check: verify-public-env.mjs ─────────────────────────────────

  describe("sync with verify-public-env.mjs", () => {
    it("REQUIRED_KEYS in verify-public-env.mjs matches the contract", () => {
      const scriptPath = resolve(__dirname, "../../../../scripts/verify-public-env.mjs");
      const scriptContent = readFileSync(scriptPath, "utf-8");

      // Extract REQUIRED_KEYS array from the script source
      const match = scriptContent.match(/const REQUIRED_KEYS\s*=\s*\[([\s\S]*?)\];/);
      expect(match).not.toBeNull();

      // Parse the keys from the match
      const rawKeys = match![1];
      const scriptKeys = [...rawKeys.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

      // The script uses base names (no prefix), the contract uses EXPO_PUBLIC_ prefix
      const contractBaseNames = REQUIRED_PUBLIC_VARS.map((name) =>
        name.replace(/^EXPO_PUBLIC_/, "")
      );

      expect(scriptKeys.sort()).toEqual(contractBaseNames.sort());
    });
  });
});
