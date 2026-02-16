/**
 * @fileoverview Extended tests for replay protection service
 *
 * Covers:
 * - createRedisReplayStore: Redis NX set, fallback to memory
 * - createMemoryReplayStore: basic operations
 * - getDefaultReplayStore selection logic
 * - verifyReplayProtection: all result types
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock redis
let mockRedisClient: any = null;

vi.mock("../redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

// Mock logger
vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock db
vi.mock("../db", () => ({
  getDb: () => ({
    transaction: vi.fn(async (cb: any) =>
      cb({
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        then: (resolve: any) => Promise.resolve([]).then(resolve),
      })
    ),
  }),
}));

// Mock schema
vi.mock("@shared/schema", () => ({
  checkinNonces: {
    _table: "checkinNonces",
    id: { name: "id" },
    userId: { name: "userId" },
    nonce: { name: "nonce" },
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

const { createMemoryReplayStore, createRedisReplayStore, verifyReplayProtection } =
  await import("../services/replayProtection");

describe("ReplayProtection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient = null;
  });

  describe("createMemoryReplayStore", () => {
    it("should store a new nonce", async () => {
      const store = createMemoryReplayStore();
      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 34.0,
        lng: -118.0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      });
      expect(result).toBe("stored");
    });

    it("should detect replay of same nonce", async () => {
      const store = createMemoryReplayStore();
      const record = {
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 34.0,
        lng: -118.0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      };

      await store.checkAndStore(record);
      const result = await store.checkAndStore(record);
      expect(result).toBe("replay");
    });

    it("should allow expired nonce to be reused", async () => {
      const store = createMemoryReplayStore();
      const record = {
        userId: "user-1",
        nonce: "nonce-1",
        actionHash: "hash-1",
        spotId: 1,
        lat: 34.0,
        lng: -118.0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() - 1000, // Already expired
      };

      await store.checkAndStore(record);
      const result = await store.checkAndStore(record);
      expect(result).toBe("stored");
    });
  });

  describe("createRedisReplayStore", () => {
    it("should fallback to memory when redis is null", async () => {
      mockRedisClient = null;
      const store = createRedisReplayStore();
      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-2",
        actionHash: "hash-2",
        spotId: 1,
        lat: 34.0,
        lng: -118.0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      });
      expect(result).toBe("stored");
    });

    it("should use redis SET NX when redis is available", async () => {
      const mockSet = vi.fn().mockResolvedValue("OK");
      mockRedisClient = { set: mockSet };

      const store = createRedisReplayStore();
      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-3",
        actionHash: "hash-3",
        spotId: 1,
        lat: 34.0,
        lng: -118.0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      });

      expect(result).toBe("stored");
      expect(mockSet).toHaveBeenCalledWith(
        "replay:user-1_nonce-3",
        "hash-3",
        "EX",
        expect.any(Number),
        "NX"
      );
    });

    it("should detect replay via redis SET NX returning null", async () => {
      const mockSet = vi.fn().mockResolvedValue(null);
      mockRedisClient = { set: mockSet };

      const store = createRedisReplayStore();
      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-4",
        actionHash: "hash-4",
        spotId: 1,
        lat: 34.0,
        lng: -118.0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      });

      expect(result).toBe("replay");
    });

    it("should fallback to memory on redis error", async () => {
      const mockSet = vi.fn().mockRejectedValue(new Error("Redis down"));
      mockRedisClient = { set: mockSet };

      const store = createRedisReplayStore();
      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-5",
        actionHash: "hash-5",
        spotId: 1,
        lat: 34.0,
        lng: -118.0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() + 300000,
      });

      expect(result).toBe("stored");
    });

    it("should return stored when TTL is zero or negative", async () => {
      const mockSet = vi.fn();
      mockRedisClient = { set: mockSet };

      const store = createRedisReplayStore();
      const result = await store.checkAndStore({
        userId: "user-1",
        nonce: "nonce-6",
        actionHash: "hash-6",
        spotId: 1,
        lat: 34.0,
        lng: -118.0,
        clientTimestamp: new Date().toISOString(),
        expiresAtMs: Date.now() - 1000, // Already expired
      });

      expect(result).toBe("stored");
      expect(mockSet).not.toHaveBeenCalled();
    });
  });

  describe("verifyReplayProtection", () => {
    const memoryStore = createMemoryReplayStore();

    it("should return ok for valid unique request", async () => {
      const result = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 34.0,
          lng: -118.0,
          nonce: "unique-nonce-" + Date.now(),
          clientTimestamp: new Date().toISOString(),
        },
        memoryStore
      );
      expect(result.ok).toBe(true);
    });

    it("should reject invalid timestamp", async () => {
      const result = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 34.0,
          lng: -118.0,
          nonce: "nonce-ts-1",
          clientTimestamp: "not-a-date",
        },
        memoryStore
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("invalid_timestamp");
    });

    it("should reject stale timestamp", async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const result = await verifyReplayProtection(
        "user-1",
        {
          spotId: 1,
          lat: 34.0,
          lng: -118.0,
          nonce: "nonce-stale-1",
          clientTimestamp: staleDate,
        },
        memoryStore
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("stale_timestamp");
    });

    it("should detect replay of same nonce", async () => {
      const store = createMemoryReplayStore();
      const payload = {
        spotId: 1,
        lat: 34.0,
        lng: -118.0,
        nonce: "replay-nonce-1",
        clientTimestamp: new Date().toISOString(),
      };

      await verifyReplayProtection("user-1", payload, store);
      const result = await verifyReplayProtection("user-1", payload, store);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("replay_detected");
    });
  });
});
