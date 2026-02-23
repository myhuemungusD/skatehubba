/**
 * @fileoverview Tests for server/middleware/cronAuth.ts
 *
 * Covers all branches of verifyCronSecret:
 * - CRON_SECRET not configured
 * - Missing auth header
 * - Length mismatch
 * - Valid secret (timingSafeEqual match)
 * - Invalid secret (timingSafeEqual no match)
 * - timingSafeEqual throws (buffer encoding error)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("verifyCronSecret", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns false and warns when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const { verifyCronSecret } = await import("../cronAuth");
    const logger = (await import("../../logger")).default;

    expect(verifyCronSecret("Bearer something")).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("CRON_SECRET not configured"));
  });

  it("returns false when authHeader is undefined", async () => {
    process.env.CRON_SECRET = "test-cron-secret-123";
    const { verifyCronSecret } = await import("../cronAuth");

    expect(verifyCronSecret(undefined)).toBe(false);
  });

  it("returns false when authHeader length does not match expected", async () => {
    process.env.CRON_SECRET = "test-cron-secret-123";
    const { verifyCronSecret } = await import("../cronAuth");

    expect(verifyCronSecret("Bearer wrong-length")).toBe(false);
  });

  it("returns true when authHeader matches the secret", async () => {
    process.env.CRON_SECRET = "my-cron-secret";
    const { verifyCronSecret } = await import("../cronAuth");

    expect(verifyCronSecret("Bearer my-cron-secret")).toBe(true);
  });

  it("returns false when authHeader has correct length but wrong value", async () => {
    process.env.CRON_SECRET = "abcdef";
    const { verifyCronSecret } = await import("../cronAuth");

    // Same length as "Bearer abcdef" but different value
    expect(verifyCronSecret("Bearer xyzxyz")).toBe(false);
  });

  it("returns false when timingSafeEqual throws (catch branch)", async () => {
    process.env.CRON_SECRET = "test-secret";
    // Import the module fresh to get a clean instance
    const { verifyCronSecret } = await import("../cronAuth");

    // Provide a string with matching length but invalid UTF-8 encoding that could cause issues
    // timingSafeEqual can throw if buffers have different byte lengths despite same string length
    // We create a header with matching character length but multi-byte chars
    const expected = `Bearer test-secret`;
    // Build a string with same .length but different byte length by using multi-byte chars
    const fakeHeader = "Bearer test-secre\u0301"; // combining accent makes byte length differ
    // Only test if lengths actually match
    if (fakeHeader.length === expected.length) {
      expect(verifyCronSecret(fakeHeader)).toBe(false);
    }
  });
});
