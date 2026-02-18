/**
 * Unit tests for socketRateLimit – covers the rate-exceeded branch (line 46).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { registerRateLimitRules, checkRateLimit, cleanupRateLimits } from "../socketRateLimit";

describe("socketRateLimit", () => {
  const SOCKET_ID = "test-socket";

  beforeEach(() => {
    cleanupRateLimits(SOCKET_ID);
  });

  it("should allow events within the limit", () => {
    registerRateLimitRules({ "test:event": { maxPerWindow: 3, windowMs: 60_000 } });

    expect(checkRateLimit(SOCKET_ID, "test:event")).toBe(true);
    expect(checkRateLimit(SOCKET_ID, "test:event")).toBe(true);
    expect(checkRateLimit(SOCKET_ID, "test:event")).toBe(true);
  });

  it("should reject events once the limit is reached", () => {
    registerRateLimitRules({ "test:limited": { maxPerWindow: 2, windowMs: 60_000 } });

    expect(checkRateLimit(SOCKET_ID, "test:limited")).toBe(true);
    expect(checkRateLimit(SOCKET_ID, "test:limited")).toBe(true);
    // Third call should be rate-limited
    expect(checkRateLimit(SOCKET_ID, "test:limited")).toBe(false);
  });

  it("should allow unknown events (no rule registered)", () => {
    expect(checkRateLimit(SOCKET_ID, "unknown:event")).toBe(true);
  });
});
