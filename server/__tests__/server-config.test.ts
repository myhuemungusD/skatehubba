/**
 * @fileoverview Unit tests for server config utilities (M9 security fix)
 *
 * Tests:
 * - getAllowedOrigins: dev mode includes DEV_ORIGINS, production only uses ALLOWED_ORIGINS
 * - validateOrigin: accepts allowed origins, rejects spoofed origins, falls back safely
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// We need to test the real implementation, but environment variables affect
// the output. We'll use dynamic imports to re-evaluate the module per test.
// ============================================================================

describe("Server Config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ==========================================================================
  // getAllowedOrigins
  // ==========================================================================

  describe("getAllowedOrigins", () => {
    it("includes DEV_ORIGINS in non-production mode", async () => {
      delete process.env.NODE_ENV;
      delete process.env.ALLOWED_ORIGINS;
      const { getAllowedOrigins, DEV_ORIGINS } = await import("../config/server");

      const origins = getAllowedOrigins();
      for (const devOrigin of DEV_ORIGINS) {
        expect(origins).toContain(devOrigin);
      }
    });

    it("merges ALLOWED_ORIGINS with DEV_ORIGINS in non-production mode", async () => {
      delete process.env.NODE_ENV;
      process.env.ALLOWED_ORIGINS = "https://app.example.com,https://staging.example.com";
      const { getAllowedOrigins } = await import("../config/server");

      const origins = getAllowedOrigins();
      expect(origins).toContain("https://app.example.com");
      expect(origins).toContain("https://staging.example.com");
      // Should also include dev origins
      expect(origins.some((o: string) => o.includes("localhost"))).toBe(true);
    });

    it("returns only ALLOWED_ORIGINS in production mode", async () => {
      process.env.NODE_ENV = "production";
      process.env.ALLOWED_ORIGINS = "https://app.example.com";
      const { getAllowedOrigins } = await import("../config/server");

      const origins = getAllowedOrigins();
      expect(origins).toEqual(["https://app.example.com"]);
      // No dev origins
      expect(origins.some((o: string) => o.includes("localhost"))).toBe(false);
    });

    it("returns empty array in production with no ALLOWED_ORIGINS", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOWED_ORIGINS;
      const { getAllowedOrigins } = await import("../config/server");

      const origins = getAllowedOrigins();
      expect(origins).toEqual([]);
    });

    it("trims and filters ALLOWED_ORIGINS entries", async () => {
      delete process.env.NODE_ENV;
      process.env.ALLOWED_ORIGINS = " https://app.example.com , , https://other.com ";
      const { getAllowedOrigins } = await import("../config/server");

      const origins = getAllowedOrigins();
      expect(origins).toContain("https://app.example.com");
      expect(origins).toContain("https://other.com");
      expect(origins).not.toContain("");
      expect(origins).not.toContain(" ");
    });
  });

  // ==========================================================================
  // validateOrigin
  // ==========================================================================

  describe("validateOrigin", () => {
    it("returns origin unchanged when it is in the allowed list", async () => {
      delete process.env.NODE_ENV;
      delete process.env.ALLOWED_ORIGINS;
      const { validateOrigin, DEV_ORIGINS } = await import("../config/server");

      const origin = DEV_ORIGINS[0];
      expect(validateOrigin(origin)).toBe(origin);
    });

    it("returns fallback for undefined origin", async () => {
      delete process.env.NODE_ENV;
      delete process.env.ALLOWED_ORIGINS;
      const { validateOrigin, DEV_ORIGINS } = await import("../config/server");

      // Fallback should be first allowed origin (first dev origin)
      expect(validateOrigin(undefined)).toBe(DEV_ORIGINS[0]);
    });

    it("returns fallback for spoofed origin not in allowed list", async () => {
      delete process.env.NODE_ENV;
      delete process.env.ALLOWED_ORIGINS;
      const { validateOrigin, DEV_ORIGINS } = await import("../config/server");

      const result = validateOrigin("https://evil-phishing-site.com");
      expect(result).toBe(DEV_ORIGINS[0]);
      expect(result).not.toContain("evil");
    });

    it("uses production ALLOWED_ORIGINS as fallback in production mode", async () => {
      process.env.NODE_ENV = "production";
      process.env.ALLOWED_ORIGINS = "https://skatehubba.com";
      const { validateOrigin } = await import("../config/server");

      // Undefined origin → fallback to first production origin
      expect(validateOrigin(undefined)).toBe("https://skatehubba.com");

      // Spoofed origin → fallback to first production origin
      expect(validateOrigin("https://evil.com")).toBe("https://skatehubba.com");

      // Valid origin → returned as-is
      expect(validateOrigin("https://skatehubba.com")).toBe("https://skatehubba.com");
    });

    it("falls back to DEV_DEFAULT_ORIGIN when no origins are configured in production", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOWED_ORIGINS;
      const { validateOrigin, DEV_DEFAULT_ORIGIN } = await import("../config/server");

      // No ALLOWED_ORIGINS in production → empty list → falls to DEV_DEFAULT_ORIGIN
      expect(validateOrigin(undefined)).toBe(DEV_DEFAULT_ORIGIN);
    });

    it("accepts all configured dev origins", async () => {
      delete process.env.NODE_ENV;
      delete process.env.ALLOWED_ORIGINS;
      const { validateOrigin, DEV_ORIGINS } = await import("../config/server");

      for (const origin of DEV_ORIGINS) {
        expect(validateOrigin(origin)).toBe(origin);
      }
    });
  });
});
