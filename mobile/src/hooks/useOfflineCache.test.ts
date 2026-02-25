import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCacheUserProfile,
  mockCacheVisitedSpots,
  mockCacheActiveGame,
  mockClearCachedActiveGame,
  mockClearOfflineCache,
} = vi.hoisted(() => ({
  mockCacheUserProfile: vi.fn().mockResolvedValue(undefined),
  mockCacheVisitedSpots: vi.fn().mockResolvedValue(undefined),
  mockCacheActiveGame: vi.fn().mockResolvedValue(undefined),
  mockClearCachedActiveGame: vi.fn().mockResolvedValue(undefined),
  mockClearOfflineCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/offlineCache", () => ({
  cacheUserProfile: mockCacheUserProfile,
  cacheVisitedSpots: mockCacheVisitedSpots,
  cacheActiveGame: mockCacheActiveGame,
  clearCachedActiveGame: mockClearCachedActiveGame,
  clearOfflineCache: mockClearOfflineCache,
}));

vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    getQueryCache: vi.fn(() => ({
      subscribe: vi.fn(() => vi.fn()),
    })),
  },
}));

vi.mock("@/lib/firebase.config", () => ({
  auth: { currentUser: null },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(() => vi.fn()),
  signOut: vi.fn(),
}));

vi.mock("@/lib/analytics/logEvent", () => ({
  clearAnalyticsSession: vi.fn().mockResolvedValue(undefined),
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("useOfflineCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cacheUserProfile stores user data", async () => {
    const profile = { uid: "user-1", displayName: "Skater", email: "s@t.com", photoURL: null };
    await mockCacheUserProfile(profile);
    expect(mockCacheUserProfile).toHaveBeenCalledWith(profile);
  });

  it("cacheVisitedSpots stores spots array", async () => {
    const spots = [{ id: "spot-1", name: "Hubba" }];
    await mockCacheVisitedSpots(spots);
    expect(mockCacheVisitedSpots).toHaveBeenCalledWith(spots);
  });

  it("cacheActiveGame stores game session", async () => {
    const session = { id: "game-1", status: "active" };
    await mockCacheActiveGame(session);
    expect(mockCacheActiveGame).toHaveBeenCalledWith(session);
  });

  it("clearCachedActiveGame removes game from cache", async () => {
    await mockClearCachedActiveGame();
    expect(mockClearCachedActiveGame).toHaveBeenCalled();
  });

  it("clearOfflineCache removes all cached data", async () => {
    await mockClearOfflineCache();
    expect(mockClearOfflineCache).toHaveBeenCalled();
  });
});
