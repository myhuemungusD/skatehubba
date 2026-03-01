/**
 * Tests for replayProtection.ts — default store selection branch (line 153)
 *
 * Covers the `if (redis) return createRedisReplayStore()` branch in getDefaultReplayStore
 * by mocking getRedisClient to return a truthy value.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

describe("replayProtection — getDefaultReplayStore selects Redis when available", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses Redis store when getRedisClient returns a client (line 153 true branch)", async () => {
    const mockRedisClient = {
      set: vi.fn().mockResolvedValue("OK"),
      get: vi.fn().mockResolvedValue(null),
    };

    vi.doMock("../../redis", () => ({
      getRedisClient: () => mockRedisClient,
    }));

    vi.doMock("../../db", () => ({
      getDb: vi.fn().mockReturnValue({
        transaction: vi.fn(),
      }),
    }));

    const { verifyReplayProtection } = await import("../replayProtection");

    // Call without explicit store so it uses getDefaultReplayStore()
    const result = await verifyReplayProtection("user-test", {
      spotId: 1,
      lat: 40.7128,
      lng: -74.006,
      nonce: `nonce-redis-${Date.now()}`,
      clientTimestamp: new Date().toISOString(),
    });

    // Redis SET should have been called (meaning the Redis store was selected)
    expect(mockRedisClient.set).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});
