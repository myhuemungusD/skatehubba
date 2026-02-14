/**
 * Unit tests for Replay Protection - Postgres Store paths (lines 46-96)
 *
 * Covers:
 * - createPostgresReplayStore: new nonce insertion (lines 80-93)
 * - createPostgresReplayStore: existing unexpired nonce = replay (lines 59-63)
 * - createPostgresReplayStore: expired nonce overwrite (lines 65-77)
 * - verifyReplayProtection using postgres store as default
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());
const mockGetRedisClient = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

vi.mock("@shared/schema", () => ({
  checkinNonces: {
    id: { name: "id" },
    userId: { name: "userId" },
    nonce: { name: "nonce" },
    actionHash: { name: "actionHash" },
    spotId: { name: "spotId" },
    lat: { name: "lat" },
    lng: { name: "lng" },
    clientTimestamp: { name: "clientTimestamp" },
    expiresAt: { name: "expiresAt" },
    createdAt: { name: "createdAt" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

import { verifyReplayProtection } from "../replayProtection";

describe("Replay Protection - Postgres Store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No Redis available — forces getDefaultReplayStore to use Postgres
    mockGetRedisClient.mockReturnValue(null);
  });

  /**
   * Lines 80-93: New nonce insertion path.
   * When no existing row is found, the store inserts a new row and returns "stored".
   */
  it("stores new nonce via postgres (insert path, lines 80-93)", async () => {
    const mockInsertValues = vi.fn().mockResolvedValue({});
    const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

    const mockForUpdate = vi.fn().mockResolvedValue([]); // No existing row
    const mockWhere = vi.fn().mockReturnValue({ for: mockForUpdate });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const mockTx = {
      select: mockSelect,
      insert: mockInsert,
      update: vi.fn(),
    };

    const mockTransaction = vi.fn().mockImplementation(async (fn) => fn(mockTx));
    mockGetDb.mockReturnValue({ transaction: mockTransaction });

    const result = await verifyReplayProtection("user-1", {
      spotId: 1,
      lat: 40.7128,
      lng: -74.006,
      nonce: "fresh-nonce",
      clientTimestamp: new Date().toISOString(),
    });

    expect(result.ok).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        nonce: "fresh-nonce",
      })
    );
  });

  /**
   * Lines 59-63: Existing unexpired nonce = replay detected.
   * When an existing row is found with expiresAt in the future, returns "replay".
   */
  it("detects replay with existing unexpired nonce (lines 59-63)", async () => {
    const futureDate = new Date(Date.now() + 600_000); // 10 min in future

    const mockForUpdate = vi
      .fn()
      .mockResolvedValue([{ id: "user-1_dup-nonce", expiresAt: futureDate }]);
    const mockWhere = vi.fn().mockReturnValue({ for: mockForUpdate });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const mockTx = {
      select: mockSelect,
      insert: vi.fn(),
      update: vi.fn(),
    };

    const mockTransaction = vi.fn().mockImplementation(async (fn) => fn(mockTx));
    mockGetDb.mockReturnValue({ transaction: mockTransaction });

    const result = await verifyReplayProtection("user-1", {
      spotId: 1,
      lat: 40.7128,
      lng: -74.006,
      nonce: "dup-nonce",
      clientTimestamp: new Date().toISOString(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("replay_detected");
    }
    // Should NOT have called insert (replay = no new row)
    expect(mockTx.insert).not.toHaveBeenCalled();
  });

  /**
   * Lines 65-77: Expired nonce overwrite path.
   * When existing row has expiresAt in the past, updates it and returns "stored".
   */
  it("overwrites expired nonce in postgres (lines 65-77)", async () => {
    const pastDate = new Date(Date.now() - 600_000); // 10 min in past

    const mockForUpdate = vi
      .fn()
      .mockResolvedValue([{ id: "user-1_expired-nonce", expiresAt: pastDate }]);
    const mockWhere = vi.fn().mockReturnValue({ for: mockForUpdate });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const mockUpdateWhere = vi.fn().mockResolvedValue({});
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

    const mockTx = {
      select: mockSelect,
      insert: vi.fn(),
      update: mockUpdate,
    };

    const mockTransaction = vi.fn().mockImplementation(async (fn) => fn(mockTx));
    mockGetDb.mockReturnValue({ transaction: mockTransaction });

    const result = await verifyReplayProtection("user-1", {
      spotId: 1,
      lat: 40.7128,
      lng: -74.006,
      nonce: "expired-nonce",
      clientTimestamp: new Date().toISOString(),
    });

    expect(result.ok).toBe(true);
    // Should have called update (overwrite) not insert
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockTx.insert).not.toHaveBeenCalled();
  });

  /**
   * Line 96: transaction returns the result properly
   */
  it("returns transaction result correctly through verifyReplayProtection", async () => {
    const mockInsertValues = vi.fn().mockResolvedValue({});
    const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

    const mockForUpdate = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ for: mockForUpdate });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const mockTx = {
      select: mockSelect,
      insert: mockInsert,
      update: vi.fn(),
    };

    const mockTransaction = vi.fn().mockImplementation(async (fn) => fn(mockTx));
    mockGetDb.mockReturnValue({ transaction: mockTransaction });

    // Verify the full flow works end to end
    const result = await verifyReplayProtection("user-2", {
      spotId: 42,
      lat: 34.05,
      lng: -118.25,
      nonce: "unique-nonce-123",
      clientTimestamp: new Date().toISOString(),
    });

    expect(result).toEqual({ ok: true });
    expect(mockTransaction).toHaveBeenCalled();
  });
});
