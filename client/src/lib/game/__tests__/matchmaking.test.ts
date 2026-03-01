/**
 * Tests for client/src/lib/game/matchmaking.ts
 *
 * Covers: findQuickMatch, cancelMatchmaking, subscribeToQueue
 * Focuses on uncovered branches:
 * - Line 38: displayName || "Skater" fallback, photoURL nullish
 * - Line 66: crypto.getRandomValues coin flip ternary (both outcomes)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = vi.hoisted(() => ({
  currentUser: {
    uid: "user-1",
    displayName: "TestSkater",
    photoURL: "https://example.com/photo.jpg",
  } as any,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: any, name: string) => ({ _path: name })),
  doc: vi.fn((...args: any[]) => {
    if (args.length >= 3 && typeof args[2] === "string") {
      return { id: args[2], _col: args[1] };
    }
    return { id: "auto-generated-id", _col: "auto" };
  }),
  runTransaction: vi.fn(),
  query: vi.fn((...args: any[]) => ({ _query: true, args })),
  where: vi.fn((...args: any[]) => ({ _where: true, args })),
  limit: vi.fn((n: number) => ({ _limit: n })),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
}));

vi.mock("../../firebase", () => ({
  db: { _mockDb: true },
  auth: mockAuth,
}));

vi.mock("../../logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { runTransaction, getDocs, onSnapshot } from "firebase/firestore";
import { findQuickMatch, cancelMatchmaking, subscribeToQueue } from "../matchmaking";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("matchmaking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = {
      uid: "user-1",
      displayName: "TestSkater",
      photoURL: "https://example.com/photo.jpg",
    };
  });

  // ────────────────────────────────────────────────────────────────────────
  // findQuickMatch — displayName / photoURL fallbacks (line 38)
  // ────────────────────────────────────────────────────────────────────────

  describe("findQuickMatch — displayName and photoURL fallbacks", () => {
    it("uses 'Skater' fallback when displayName is null (line 38)", async () => {
      mockAuth.currentUser = {
        uid: "user-1",
        displayName: null,
        photoURL: null,
      };

      vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
      const mockTx = { set: vi.fn() };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      const result = await findQuickMatch("regular");

      expect(result.isWaiting).toBe(true);
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          creatorName: "Skater",
          creatorPhoto: null,
        })
      );
    });

    it("uses 'Skater' fallback when displayName is empty string (line 38)", async () => {
      mockAuth.currentUser = {
        uid: "user-1",
        displayName: "",
        photoURL: "https://example.com/photo.jpg",
      };

      vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
      const mockTx = { set: vi.fn() };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      const result = await findQuickMatch();

      expect(result.isWaiting).toBe(true);
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          creatorName: "Skater",
        })
      );
    });

    it("uses actual displayName when present", async () => {
      vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
      const mockTx = { set: vi.fn() };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      await findQuickMatch("goofy");

      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          creatorName: "TestSkater",
          creatorPhoto: "https://example.com/photo.jpg",
        })
      );
    });

    it("passes photoURL as null when user has no photo", async () => {
      mockAuth.currentUser = {
        uid: "user-1",
        displayName: "TestSkater",
        photoURL: null,
      };

      vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
      const mockTx = { set: vi.fn() };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      await findQuickMatch();

      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          creatorPhoto: null,
        })
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // findQuickMatch — coin flip ternary (line 66)
  // ────────────────────────────────────────────────────────────────────────

  describe("findQuickMatch — coin flip starter selection (line 66)", () => {
    it("selects player at index 0 when random value < 0x80000000", async () => {
      // Mock crypto.getRandomValues to return a value < 0x80000000
      const mockGetRandomValues = vi.fn((arr: Uint32Array) => {
        arr[0] = 0x00000001; // well below threshold
        return arr;
      });
      vi.stubGlobal("crypto", { getRandomValues: mockGetRandomValues });

      vi.mocked(getDocs).mockResolvedValue({
        docs: [
          {
            data: () => ({
              createdBy: "other-player",
              creatorName: "OtherSkater",
              creatorPhoto: null,
              stance: "regular",
              status: "WAITING",
            }),
            ref: { id: "queue-entry-1" },
          },
        ],
      } as any);

      const mockTx = { set: vi.fn(), delete: vi.fn() };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      const result = await findQuickMatch("goofy");

      expect(result.isWaiting).toBe(false);
      // starterIndex = 0, players = [matchData.createdBy, userId] = ["other-player", "user-1"]
      // starterId = players[0] = "other-player"
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          state: expect.objectContaining({
            turnPlayerId: "other-player",
          }),
        })
      );

      vi.unstubAllGlobals();
    });

    it("selects player at index 1 when random value >= 0x80000000", async () => {
      // Mock crypto.getRandomValues to return a value >= 0x80000000
      const mockGetRandomValues = vi.fn((arr: Uint32Array) => {
        arr[0] = 0x80000000; // at threshold
        return arr;
      });
      vi.stubGlobal("crypto", { getRandomValues: mockGetRandomValues });

      vi.mocked(getDocs).mockResolvedValue({
        docs: [
          {
            data: () => ({
              createdBy: "other-player",
              creatorName: "OtherSkater",
              creatorPhoto: null,
              stance: "regular",
              status: "WAITING",
            }),
            ref: { id: "queue-entry-1" },
          },
        ],
      } as any);

      const mockTx = { set: vi.fn(), delete: vi.fn() };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      const result = await findQuickMatch("goofy");

      expect(result.isWaiting).toBe(false);
      // starterIndex = 1, players = ["other-player", "user-1"]
      // starterId = players[1] = "user-1"
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          state: expect.objectContaining({
            turnPlayerId: "user-1",
          }),
        })
      );

      vi.unstubAllGlobals();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // findQuickMatch — auth guard
  // ────────────────────────────────────────────────────────────────────────

  describe("findQuickMatch — auth guard", () => {
    it("throws when user is not logged in", async () => {
      mockAuth.currentUser = null;
      await expect(findQuickMatch()).rejects.toThrow("Must be logged in to play");
    });

    it("defaults stance to 'regular' when not provided", async () => {
      vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
      const mockTx = { set: vi.fn() };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      await findQuickMatch();

      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          stance: "regular",
        })
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // cancelMatchmaking
  // ────────────────────────────────────────────────────────────────────────

  describe("cancelMatchmaking", () => {
    it("throws when user is not logged in", async () => {
      mockAuth.currentUser = null;
      await expect(cancelMatchmaking("q-1")).rejects.toThrow("Must be logged in");
    });

    it("does nothing when queue entry does not exist", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
        delete: vi.fn(),
      };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      await cancelMatchmaking("q-1");
      expect(mockTx.delete).not.toHaveBeenCalled();
    });

    it("throws when trying to cancel another player's queue", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ createdBy: "other-user" }),
        }),
        delete: vi.fn(),
      };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      await expect(cancelMatchmaking("q-1")).rejects.toThrow(
        "Cannot cancel another player's queue"
      );
    });

    it("deletes queue entry when owned by current user", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ createdBy: "user-1" }),
        }),
        delete: vi.fn(),
      };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      await cancelMatchmaking("q-1");
      expect(mockTx.delete).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // subscribeToQueue
  // ────────────────────────────────────────────────────────────────────────

  describe("subscribeToQueue", () => {
    it("calls onMatch when queue entry is deleted and game is found", async () => {
      vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
        callback({ exists: () => false });
        return vi.fn();
      });

      vi.mocked(getDocs).mockResolvedValue({
        empty: false,
        docs: [{ id: "matched-game-123" }],
      } as any);

      const onMatch = vi.fn();
      subscribeToQueue("q-1", onMatch);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onMatch).toHaveBeenCalledWith("matched-game-123");
    });

    it("does not call onMatch when user is not logged in", async () => {
      mockAuth.currentUser = null;

      vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
        callback({ exists: () => false });
        return vi.fn();
      });

      const onMatch = vi.fn();
      subscribeToQueue("q-1", onMatch);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(getDocs).not.toHaveBeenCalled();
      expect(onMatch).not.toHaveBeenCalled();
    });

    it("does nothing when queue entry still exists", async () => {
      vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
        callback({ exists: () => true });
        return vi.fn();
      });

      const onMatch = vi.fn();
      subscribeToQueue("q-1", onMatch);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(getDocs).not.toHaveBeenCalled();
      expect(onMatch).not.toHaveBeenCalled();
    });
  });
});
