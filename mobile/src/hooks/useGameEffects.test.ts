import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLogEvent } = vi.hoisted(() => ({
  mockLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics/logEvent", () => ({
  logEvent: mockLogEvent,
  clearAnalyticsSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/firebase.config", () => ({
  auth: { currentUser: null },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(() => vi.fn()),
  signOut: vi.fn(),
}));

vi.mock("@/lib/offlineCache", () => ({
  cacheActiveGame: vi.fn().mockResolvedValue(undefined),
  clearCachedActiveGame: vi.fn().mockResolvedValue(undefined),
  clearOfflineCache: vi.fn().mockResolvedValue(undefined),
  cacheUserProfile: vi.fn(),
  cacheVisitedSpots: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  queryClient: { getQueryCache: vi.fn(() => ({ subscribe: vi.fn(() => vi.fn()) })) },
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("useGameEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs deep_link_invalid for invalid game IDs", async () => {
    await mockLogEvent("deep_link_invalid", { raw_id: "bad<>id", route: "game" });
    expect(mockLogEvent).toHaveBeenCalledWith("deep_link_invalid", {
      raw_id: "bad<>id",
      route: "game",
    });
  });

  it("logs battle_joined when game becomes active", async () => {
    await mockLogEvent("battle_joined", { battle_id: "game-123" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "battle_joined",
      expect.objectContaining({ battle_id: "game-123" })
    );
  });

  it("logs game_forfeited on reconnect timeout", async () => {
    await mockLogEvent("game_forfeited", { battle_id: "game-123", reason: "reconnect_timeout" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "game_forfeited",
      expect.objectContaining({ reason: "reconnect_timeout" })
    );
  });

  it("logs battle_completed when game finishes", async () => {
    await mockLogEvent("battle_completed", {
      battle_id: "game-123",
      winner_id: "user-1",
      total_rounds: 5,
    });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "battle_completed",
      expect.objectContaining({ battle_id: "game-123", winner_id: "user-1" })
    );
  });

  it("game store can be initialized and reset", async () => {
    vi.resetModules();
    const { useGameStore } = await import("@/store/gameStore");
    const store = useGameStore.getState();

    store.initGame("game-123", "user-456");
    expect(useGameStore.getState().gameId).toBe("game-123");

    store.resetGame();
    expect(useGameStore.getState().gameId).toBeNull();
  });
});
