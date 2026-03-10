import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetItem, mockSetItem, mockRemoveItem, mockMultiRemove } = vi.hoisted(() => ({
  mockGetItem: vi.fn(),
  mockSetItem: vi.fn().mockResolvedValue(undefined),
  mockRemoveItem: vi.fn().mockResolvedValue(undefined),
  mockMultiRemove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: mockRemoveItem,
    multiRemove: mockMultiRemove,
  },
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

import {
  cacheActiveGame,
  cacheVisitedSpots,
  cacheUserProfile,
  clearCachedActiveGame,
  clearOfflineCache,
  getCachedActiveGame,
  getCachedVisitedSpots,
  getCachedUserProfile,
} from "../offlineCache";

/** 24 hours in milliseconds — mirrors MAX_CACHE_AGE_MS in offlineCache.ts */
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

describe("offlineCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    mockGetItem.mockResolvedValue(JSON.stringify({}));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("cacheActiveGame", () => {
    it("writes game session to AsyncStorage", async () => {
      const session = { id: "game-1", status: "active" } as any;
      await cacheActiveGame(session);
      expect(mockSetItem).toHaveBeenCalledWith(
        "skatehubba_offline_active_game",
        JSON.stringify(session)
      );
    });
  });

  describe("cacheVisitedSpots", () => {
    it("writes spots array to AsyncStorage", async () => {
      const spots = [{ id: "s1", name: "Hubba" }] as any;
      await cacheVisitedSpots(spots);
      expect(mockSetItem).toHaveBeenCalledWith(
        "skatehubba_offline_visited_spots",
        JSON.stringify(spots)
      );
    });
  });

  describe("cacheUserProfile", () => {
    it("writes user profile to AsyncStorage", async () => {
      const profile = { uid: "u1", displayName: "Sk8r", email: "s@t.com", photoURL: null };
      await cacheUserProfile(profile);
      expect(mockSetItem).toHaveBeenCalledWith(
        "skatehubba_offline_user_profile",
        JSON.stringify(profile)
      );
    });
  });

  describe("clearCachedActiveGame", () => {
    it("removes active game key", async () => {
      await clearCachedActiveGame();
      expect(mockRemoveItem).toHaveBeenCalledWith("skatehubba_offline_active_game");
    });
  });

  describe("clearOfflineCache", () => {
    it("removes all cache keys", async () => {
      await clearOfflineCache();
      expect(mockMultiRemove).toHaveBeenCalledWith([
        "skatehubba_offline_active_game",
        "skatehubba_offline_visited_spots",
        "skatehubba_offline_user_profile",
        "skatehubba_offline_timestamps",
      ]);
    });
  });

  // ==========================================================================
  // Cache READ functions + TTL / staleness
  // ==========================================================================

  describe("getCachedActiveGame", () => {
    const session = { id: "game-1", status: "active", players: [] };

    it("returns parsed game session when cache is fresh", async () => {
      const freshTimestamp = Date.now() - 1000; // 1 second ago
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ activeGame: freshTimestamp }));
        if (key === "skatehubba_offline_active_game")
          return Promise.resolve(JSON.stringify(session));
        return Promise.resolve(null);
      });

      const result = await getCachedActiveGame();
      expect(result).toEqual(session);
    });

    it("returns null when cache is stale (>24h)", async () => {
      const staleTimestamp = Date.now() - MAX_CACHE_AGE_MS - 1;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ activeGame: staleTimestamp }));
        if (key === "skatehubba_offline_active_game")
          return Promise.resolve(JSON.stringify(session));
        return Promise.resolve(null);
      });

      const result = await getCachedActiveGame();
      expect(result).toBeNull();
    });

    it("returns null when no timestamp exists", async () => {
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps") return Promise.resolve(JSON.stringify({}));
        if (key === "skatehubba_offline_active_game")
          return Promise.resolve(JSON.stringify(session));
        return Promise.resolve(null);
      });

      const result = await getCachedActiveGame();
      expect(result).toBeNull();
    });

    it("returns null when no cached data exists", async () => {
      const freshTimestamp = Date.now() - 1000;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ activeGame: freshTimestamp }));
        return Promise.resolve(null);
      });

      const result = await getCachedActiveGame();
      expect(result).toBeNull();
    });

    it("returns null on JSON parse error", async () => {
      const freshTimestamp = Date.now() - 1000;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ activeGame: freshTimestamp }));
        if (key === "skatehubba_offline_active_game") return Promise.resolve("{invalid json");
        return Promise.resolve(null);
      });

      const result = await getCachedActiveGame();
      expect(result).toBeNull();
    });
  });

  describe("getCachedVisitedSpots", () => {
    const spots = [
      { id: "s1", name: "Hubba Hideout" },
      { id: "s2", name: "EMB" },
    ];

    it("returns parsed spots array when cache is fresh", async () => {
      const freshTimestamp = Date.now() - 5000;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ visitedSpots: freshTimestamp }));
        if (key === "skatehubba_offline_visited_spots")
          return Promise.resolve(JSON.stringify(spots));
        return Promise.resolve(null);
      });

      const result = await getCachedVisitedSpots();
      expect(result).toEqual(spots);
    });

    it("returns empty array when cache is stale", async () => {
      const staleTimestamp = Date.now() - MAX_CACHE_AGE_MS - 1;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ visitedSpots: staleTimestamp }));
        if (key === "skatehubba_offline_visited_spots")
          return Promise.resolve(JSON.stringify(spots));
        return Promise.resolve(null);
      });

      const result = await getCachedVisitedSpots();
      expect(result).toEqual([]);
    });

    it("returns empty array when no cached data exists", async () => {
      const freshTimestamp = Date.now() - 1000;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ visitedSpots: freshTimestamp }));
        return Promise.resolve(null);
      });

      const result = await getCachedVisitedSpots();
      expect(result).toEqual([]);
    });
  });

  describe("getCachedUserProfile", () => {
    const profile = { uid: "u1", displayName: "Sk8r", email: "s@t.com", photoURL: null };

    it("returns parsed profile when cache is fresh", async () => {
      const freshTimestamp = Date.now() - 3000;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ userProfile: freshTimestamp }));
        if (key === "skatehubba_offline_user_profile")
          return Promise.resolve(JSON.stringify(profile));
        return Promise.resolve(null);
      });

      const result = await getCachedUserProfile();
      expect(result).toEqual(profile);
    });

    it("returns null when cache is stale", async () => {
      const staleTimestamp = Date.now() - MAX_CACHE_AGE_MS - 1;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ userProfile: staleTimestamp }));
        if (key === "skatehubba_offline_user_profile")
          return Promise.resolve(JSON.stringify(profile));
        return Promise.resolve(null);
      });

      const result = await getCachedUserProfile();
      expect(result).toBeNull();
    });

    it("returns null when no cached data exists", async () => {
      const freshTimestamp = Date.now() - 1000;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ userProfile: freshTimestamp }));
        return Promise.resolve(null);
      });

      const result = await getCachedUserProfile();
      expect(result).toBeNull();
    });
  });

  describe("TTL boundary conditions", () => {
    const session = { id: "game-1", status: "active" };

    it("cache is fresh at exactly 23h 59m 59s", async () => {
      const almostStale = Date.now() - (MAX_CACHE_AGE_MS - 1000);
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ activeGame: almostStale }));
        if (key === "skatehubba_offline_active_game")
          return Promise.resolve(JSON.stringify(session));
        return Promise.resolve(null);
      });

      const result = await getCachedActiveGame();
      expect(result).toEqual(session);
    });

    it("cache is still fresh at exactly 24h (isStale uses > not >=)", async () => {
      const exactBoundary = Date.now() - MAX_CACHE_AGE_MS;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ activeGame: exactBoundary }));
        if (key === "skatehubba_offline_active_game")
          return Promise.resolve(JSON.stringify(session));
        return Promise.resolve(null);
      });

      const result = await getCachedActiveGame();
      expect(result).toEqual(session);
    });

    it("cache is stale at 24h + 1ms", async () => {
      const justStale = Date.now() - MAX_CACHE_AGE_MS - 1;
      mockGetItem.mockImplementation((key: string) => {
        if (key === "skatehubba_offline_timestamps")
          return Promise.resolve(JSON.stringify({ activeGame: justStale }));
        if (key === "skatehubba_offline_active_game")
          return Promise.resolve(JSON.stringify(session));
        return Promise.resolve(null);
      });

      const result = await getCachedActiveGame();
      expect(result).toBeNull();
    });
  });
});
