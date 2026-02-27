/**
 * @fileoverview Unit tests for replayProtection service
 *
 * Covers:
 * - verifyReplayProtection: invalid timestamp, stale timestamp, replay detection, ok path
 * - createMemoryReplayStore: stored, replay, expired nonce overwrite
 * - createRedisReplayStore: stored, replay, ttl<=0, redis error fallback, null redis fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =============================================================================
// Mocks — must be before imports
// =============================================================================

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  checkinNonces: {
    id: "id",
    userId: "userId",
    nonce: "nonce",
    actionHash: "actionHash",
    spotId: "spotId",
    lat: "lat",
    lng: "lng",
    clientTimestamp: "clientTimestamp",
    expiresAt: "expiresAt",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

let mockRedisClient: any = null;

vi.mock("../../redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

// =============================================================================
// Imports
// =============================================================================

import {
  createMemoryReplayStore,
  createRedisReplayStore,
  verifyReplayProtection,
} from "../../services/replayProtection";

// =============================================================================
// Helpers
// =============================================================================

function makePayload(
  overrides: Partial<{
    spotId: number;
    lat: number;
    lng: number;
    nonce: string;
    clientTimestamp: string;
  }> = {}
) {
  return {
    spotId: 42,
    lat: 37.7749,
    lng: -122.4194,
    nonce: "test-nonce-123",
    clientTimestamp: new Date().toISOString(),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("replayProtection service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient = null;
  });

  // ===========================================================================
  // verifyReplayProtection
  // ===========================================================================

  describe("verifyReplayProtection", () => {
    it("returns ok: true for a fresh request", async () => {
      const store = createMemoryReplayStore();
      const result = await verifyReplayProtection("user-1", makePayload(), store);
      expect(result).toEqual({ ok: true });
    });

    it("returns invalid_timestamp for unparseable clientTimestamp", async () => {
      const store = createMemoryReplayStore();
      const result = await verifyReplayProtection(
        "user-1",
        makePayload({ clientTimestamp: "not-a-date" }),
        store
      );
      expect(result).toEqual({ ok: false, reason: "invalid_timestamp" });
    });

    it("returns stale_timestamp when clientTimestamp is too old", async () => {
      const store = createMemoryReplayStore();
      const oldTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
      const result = await verifyReplayProtection(
        "user-1",
        makePayload({ clientTimestamp: oldTime }),
        store
      );
      expect(result).toEqual({ ok: false, reason: "stale_timestamp" });
    });

    it("returns stale_timestamp when clientTimestamp is too far in the future", async () => {
      const store = createMemoryReplayStore();
      const futureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now
      const result = await verifyReplayProtection(
        "user-1",
        makePayload({ clientTimestamp: futureTime }),
        store
      );
      expect(result).toEqual({ ok: false, reason: "stale_timestamp" });
    });

    it("returns replay_detected on duplicate nonce for same user", async () => {
      const store = createMemoryReplayStore();
      const payload = makePayload();

      const first = await verifyReplayProtection("user-1", payload, store);
      const second = await verifyReplayProtection("user-1", payload, store);

      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: false, reason: "replay_detected" });
    });

    it("allows same nonce for different users", async () => {
      const store = createMemoryReplayStore();
      const payload = makePayload();

      const first = await verifyReplayProtection("user-1", payload, store);
      const second = await verifyReplayProtection("user-2", payload, store);

      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: true });
    });

    it("allows different nonces for same user", async () => {
      const store = createMemoryReplayStore();

      const first = await verifyReplayProtection(
        "user-1",
        makePayload({ nonce: "nonce-a" }),
        store
      );
      const second = await verifyReplayProtection(
        "user-1",
        makePayload({ nonce: "nonce-b" }),
        store
      );

      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: true });
    });
  });

  // ===========================================================================
  // createMemoryReplayStore
  // ===========================================================================

  describe("createMemoryReplayStore", () => {
    it("stores a new record and returns 'stored'", async () => {
      const store = createMemoryReplayStore();
      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 0,
        lng: 0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 60_000,
      });
      expect(result).toBe("stored");
    });

    it("detects replay when same key exists and is not expired", async () => {
      const store = createMemoryReplayStore();
      const record = {
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 0,
        lng: 0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 60_000,
      };
      await store.checkAndStore(record);
      const result = await store.checkAndStore(record);
      expect(result).toBe("replay");
    });

    it("allows reuse of a key after it has expired", async () => {
      const store = createMemoryReplayStore();
      const record = {
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 0,
        lng: 0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() - 1, // already expired
      };

      await store.checkAndStore(record);

      const result = await store.checkAndStore({
        ...record,
        expiresAtMs: Date.now() + 60_000,
      });
      expect(result).toBe("stored");
    });
  });

  // ===========================================================================
  // createRedisReplayStore
  // ===========================================================================

  describe("createRedisReplayStore", () => {
    it("falls back to memory store when redis client is null", async () => {
      mockRedisClient = null;
      const store = createRedisReplayStore();

      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 0,
        lng: 0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 60_000,
      });
      expect(result).toBe("stored");
    });

    it("returns 'stored' when redis SET NX succeeds (returns 'OK')", async () => {
      mockRedisClient = {
        set: vi.fn().mockResolvedValue("OK"),
      };
      const store = createRedisReplayStore();

      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 0,
        lng: 0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 60_000,
      });
      expect(result).toBe("stored");
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "replay:user-1_nonce-1",
        "hash-1",
        "EX",
        expect.any(Number),
        "NX"
      );
    });

    it("returns 'replay' when redis SET NX fails (returns null)", async () => {
      mockRedisClient = {
        set: vi.fn().mockResolvedValue(null),
      };
      const store = createRedisReplayStore();

      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 0,
        lng: 0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 60_000,
      });
      expect(result).toBe("replay");
    });

    it("returns 'stored' when ttl is <= 0 (expired before set)", async () => {
      mockRedisClient = {
        set: vi.fn(),
      };
      const store = createRedisReplayStore();

      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 0,
        lng: 0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() - 1000, // already expired
      });
      expect(result).toBe("stored");
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it("falls back to memory store when redis.set throws", async () => {
      mockRedisClient = {
        set: vi.fn().mockRejectedValue(new Error("Redis connection lost")),
      };
      const store = createRedisReplayStore();

      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 0,
        lng: 0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 60_000,
      });
      // Should fall back to memory store
      expect(result).toBe("stored");
    });

    it("memory fallback on redis error still detects replay on second call", async () => {
      mockRedisClient = {
        set: vi.fn().mockRejectedValue(new Error("Redis down")),
      };
      const store = createRedisReplayStore();

      const record = {
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 0,
        lng: 0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 60_000,
      };

      const first = await store.checkAndStore(record);
      const second = await store.checkAndStore(record);

      expect(first).toBe("stored");
      expect(second).toBe("replay");
    });
  });
});
