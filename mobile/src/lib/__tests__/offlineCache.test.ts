import { describe, it, expect, vi, beforeEach } from "vitest";

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
} from "../offlineCache";

describe("offlineCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItem.mockResolvedValue(JSON.stringify({}));
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
});
