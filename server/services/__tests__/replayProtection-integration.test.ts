/**
 * Integration tests for Replay Protection
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  verifyReplayProtection,
  createMemoryReplayStore,
  createRedisReplayStore,
} from "../replayProtection";

// Mock dependencies
vi.mock("../../db", () => ({
  getDb: vi.fn().mockReturnValue({
    transaction: vi.fn().mockImplementation(async (fn) => {
      return fn({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue({}),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
      });
    }),
  }),
}));

vi.mock("../../redis", () => ({
  getRedisClient: vi.fn().mockReturnValue(null),
}));

describe("Replay Protection Integration", () => {
  describe("Memory Replay Store", () => {
    it("should store new nonce", async () => {
      const store = createMemoryReplayStore();
      const result = await store.checkAndStore({
        userId: "user-123",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      });

      expect(result).toBe("stored");
    });

    it("should detect replay with same nonce", async () => {
      const store = createMemoryReplayStore();
      const record = {
        userId: "user-123",
        nonce: "nonce-duplicate",
        actionHash: "hash-1",
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      };

      const first = await store.checkAndStore(record);
      const second = await store.checkAndStore(record);

      expect(first).toBe("stored");
      expect(second).toBe("replay");
    });

    it("should allow expired nonce reuse", async () => {
      const store = createMemoryReplayStore();
      const record = {
        userId: "user-123",
        nonce: "nonce-expired",
        actionHash: "hash-1",
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() - 1000, // Expired
      };

      const first = await store.checkAndStore(record);

      // Use same nonce but with future expiry
      const recordFresh = { ...record, expiresAtMs: Date.now() + 300000 };
      const second = await store.checkAndStore(recordFresh);

      expect(first).toBe("stored");
      expect(second).toBe("stored");
    });

    it("should handle different users", async () => {
      const store = createMemoryReplayStore();
      const nonce = "shared-nonce";

      const result1 = await store.checkAndStore({
        userId: "user-1",
        nonce,
        actionHash: "hash-1",
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      });

      const result2 = await store.checkAndStore({
        userId: "user-2",
        nonce,
        actionHash: "hash-2",
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      });

      expect(result1).toBe("stored");
      expect(result2).toBe("stored");
    });
  });

  describe("Redis Replay Store", () => {
    it("should fallback to memory when Redis unavailable", async () => {
      const store = createRedisReplayStore();
      const result = await store.checkAndStore({
        userId: "user-123",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      });

      expect(result).toBeDefined();
    });
  });

  describe("verifyReplayProtection", () => {
    it("should reject invalid timestamp format", async () => {
      const result = await verifyReplayProtection("user-123", {
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        nonce: "nonce-1",
        clientTimestamp: "invalid-date",
      });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe("invalid_timestamp");
    });

    it("should reject stale timestamp", async () => {
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago

      const result = await verifyReplayProtection("user-123", {
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        nonce: "nonce-1",
        clientTimestamp: oldTimestamp,
      });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe("stale_timestamp");
    });

    it("should accept valid timestamp within skew window", async () => {
      const store = createMemoryReplayStore();
      const currentTimestamp = new Date().toISOString();

      const result = await verifyReplayProtection(
        "user-123",
        {
          spotId: 1,
          lat: 40.7128,
          lng: -74.006,
          nonce: `nonce-${Date.now()}`,
          clientTimestamp: currentTimestamp,
        },
        store
      );

      expect(result.ok).toBe(true);
    });

    it("should detect replay attack", async () => {
      const store = createMemoryReplayStore();
      const payload = {
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        nonce: "nonce-replay-test",
        clientTimestamp: new Date().toISOString(),
      };

      const first = await verifyReplayProtection("user-123", payload, store);
      const second = await verifyReplayProtection("user-123", payload, store);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      expect(second.ok === false && second.reason).toBe("replay_detected");
    });

    it("should hash action correctly", async () => {
      const store = createMemoryReplayStore();

      // Same location, same user, different nonces = both should succeed
      const result1 = await verifyReplayProtection(
        "user-123",
        {
          spotId: 1,
          lat: 40.7128,
          lng: -74.006,
          nonce: "nonce-1",
          clientTimestamp: new Date().toISOString(),
        },
        store
      );

      const result2 = await verifyReplayProtection(
        "user-123",
        {
          spotId: 1,
          lat: 40.7128,
          lng: -74.006,
          nonce: "nonce-2",
          clientTimestamp: new Date().toISOString(),
        },
        store
      );

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });

    it("should handle decimal precision in coordinates", async () => {
      const store = createMemoryReplayStore();

      const result = await verifyReplayProtection(
        "user-123",
        {
          spotId: 1,
          lat: 40.71280012345,
          lng: -74.0060006789,
          nonce: "nonce-precision",
          clientTimestamp: new Date().toISOString(),
        },
        store
      );

      expect(result.ok).toBe(true);
    });

    it("should differentiate between different spots", async () => {
      const store = createMemoryReplayStore();
      const timestamp = new Date().toISOString();

      const result1 = await verifyReplayProtection(
        "user-123",
        {
          spotId: 1,
          lat: 40.7128,
          lng: -74.006,
          nonce: "nonce-spot1",
          clientTimestamp: timestamp,
        },
        store
      );

      const result2 = await verifyReplayProtection(
        "user-123",
        {
          spotId: 2,
          lat: 40.7128,
          lng: -74.006,
          nonce: "nonce-spot2",
          clientTimestamp: timestamp,
        },
        store
      );

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });

    it("should handle future timestamps within skew window", async () => {
      const store = createMemoryReplayStore();
      const futureTimestamp = new Date(Date.now() + 60000).toISOString(); // 1 minute in future

      const result = await verifyReplayProtection(
        "user-123",
        {
          spotId: 1,
          lat: 40.7128,
          lng: -74.006,
          nonce: "nonce-future",
          clientTimestamp: futureTimestamp,
        },
        store
      );

      expect(result.ok).toBe(true);
    });

    it("should reject future timestamps beyond skew window", async () => {
      const store = createMemoryReplayStore();
      const farFutureTimestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes in future

      const result = await verifyReplayProtection(
        "user-123",
        {
          spotId: 1,
          lat: 40.7128,
          lng: -74.006,
          nonce: "nonce-far-future",
          clientTimestamp: farFutureTimestamp,
        },
        store
      );

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe("stale_timestamp");
    });
  });

  describe("Nonce TTL", () => {
    it("should expire nonces after TTL", async () => {
      const store = createMemoryReplayStore();
      const expiredRecord = {
        userId: "user-123",
        nonce: "nonce-ttl",
        actionHash: "hash-1",
        spotId: 1,
        lat: 40.7128,
        lng: -74.006,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() - 1, // Already expired
      };

      const result = await store.checkAndStore(expiredRecord);
      expect(result).toBe("stored");
    });
  });
});
