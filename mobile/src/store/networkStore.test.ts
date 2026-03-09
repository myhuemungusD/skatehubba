import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { mockGetCachedActiveGame, mockGetCachedVisitedSpots, mockGetCachedUserProfile } = vi.hoisted(
  () => ({
    mockGetCachedActiveGame: vi.fn(),
    mockGetCachedVisitedSpots: vi.fn(),
    mockGetCachedUserProfile: vi.fn(),
  })
);

vi.mock("@/lib/offlineCache", () => ({
  getCachedActiveGame: mockGetCachedActiveGame,
  getCachedVisitedSpots: mockGetCachedVisitedSpots,
  getCachedUserProfile: mockGetCachedUserProfile,
}));

import {
  useNetworkStore,
  RECONNECT_WINDOW_SECONDS,
  getOfflineGameSession,
  getOfflineSpots,
  getOfflineUserProfile,
} from "./networkStore";

describe("networkStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useNetworkStore.getState().resetReconnectState();
    useNetworkStore.setState({
      isConnected: true,
      activeGameIdOnDisconnect: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("starts connected", () => {
      expect(useNetworkStore.getState().isConnected).toBe(true);
    });

    it("starts with no reconnect state", () => {
      const state = useNetworkStore.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.offlineSince).toBeNull();
      expect(state.reconnectSecondsRemaining).toBe(RECONNECT_WINDOW_SECONDS);
      expect(state.reconnectExpired).toBe(false);
      expect(state.activeGameIdOnDisconnect).toBeNull();
    });
  });

  describe("setConnected - going offline", () => {
    it("sets isConnected to false", () => {
      useNetworkStore.getState().setConnected(false);
      expect(useNetworkStore.getState().isConnected).toBe(false);
    });

    it("records offlineSince timestamp", () => {
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
      useNetworkStore.getState().setConnected(false);

      expect(useNetworkStore.getState().offlineSince).toBe(Date.now());
    });

    it("starts reconnecting if an active game exists", () => {
      useNetworkStore.getState().setActiveGame("game-123");
      useNetworkStore.getState().setConnected(false);

      expect(useNetworkStore.getState().isReconnecting).toBe(true);
    });

    it("does not start reconnecting without active game", () => {
      useNetworkStore.getState().setConnected(false);

      expect(useNetworkStore.getState().isReconnecting).toBe(false);
    });

    it("is a no-op when already offline", () => {
      useNetworkStore.getState().setConnected(false);
      const offlineSince = useNetworkStore.getState().offlineSince;

      vi.advanceTimersByTime(1000);
      useNetworkStore.getState().setConnected(false);

      // offlineSince should not change
      expect(useNetworkStore.getState().offlineSince).toBe(offlineSince);
    });
  });

  describe("setConnected - coming back online", () => {
    it("sets isConnected to true", () => {
      useNetworkStore.getState().setConnected(false);
      useNetworkStore.getState().setConnected(true);

      expect(useNetworkStore.getState().isConnected).toBe(true);
    });

    it("clears reconnect state", () => {
      useNetworkStore.getState().setActiveGame("game-123");
      useNetworkStore.getState().setConnected(false);
      useNetworkStore.getState().setConnected(true);

      const state = useNetworkStore.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.offlineSince).toBeNull();
      expect(state.reconnectSecondsRemaining).toBe(RECONNECT_WINDOW_SECONDS);
    });

    it("preserves reconnectExpired if it was already expired", () => {
      useNetworkStore.getState().setActiveGame("game-123");
      useNetworkStore.getState().setConnected(false);

      // Simulate timer expiry
      useNetworkStore.setState({ reconnectExpired: true });

      useNetworkStore.getState().setConnected(true);

      expect(useNetworkStore.getState().reconnectExpired).toBe(true);
    });

    it("is a no-op when already online", () => {
      // Already online
      useNetworkStore.getState().setConnected(true);
      expect(useNetworkStore.getState().isConnected).toBe(true);
    });
  });

  describe("setActiveGame", () => {
    it("stores the game ID", () => {
      useNetworkStore.getState().setActiveGame("game-abc");
      expect(useNetworkStore.getState().activeGameIdOnDisconnect).toBe("game-abc");
    });

    it("starts reconnect timer when already offline", () => {
      useNetworkStore.getState().setConnected(false);
      useNetworkStore.getState().setActiveGame("game-abc");

      expect(useNetworkStore.getState().isReconnecting).toBe(true);
    });

    it("stops reconnect timer when game is set to null", () => {
      useNetworkStore.getState().setActiveGame("game-abc");
      useNetworkStore.getState().setConnected(false);
      useNetworkStore.getState().setActiveGame(null);

      expect(useNetworkStore.getState().isReconnecting).toBe(false);
    });
  });

  describe("updateReconnectTimer", () => {
    it("counts down remaining seconds", () => {
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
      useNetworkStore.getState().setActiveGame("game-123");
      useNetworkStore.getState().setConnected(false);

      // Advance 10 seconds
      vi.advanceTimersByTime(10000);

      const state = useNetworkStore.getState();
      expect(state.reconnectSecondsRemaining).toBeLessThanOrEqual(111);
      expect(state.reconnectSecondsRemaining).toBeGreaterThan(0);
    });

    it("sets reconnectExpired when timer runs out", () => {
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
      useNetworkStore.getState().setActiveGame("game-123");
      useNetworkStore.getState().setConnected(false);

      // Advance 120+ seconds
      vi.advanceTimersByTime(121000);

      const state = useNetworkStore.getState();
      expect(state.reconnectExpired).toBe(true);
      expect(state.reconnectSecondsRemaining).toBe(0);
      expect(state.isReconnecting).toBe(false);
    });

    it("is a no-op when online", () => {
      useNetworkStore.getState().updateReconnectTimer();

      expect(useNetworkStore.getState().reconnectSecondsRemaining).toBe(RECONNECT_WINDOW_SECONDS);
    });

    it("is a no-op when offlineSince is null", () => {
      useNetworkStore.setState({ isConnected: false, offlineSince: null });
      useNetworkStore.getState().updateReconnectTimer();

      expect(useNetworkStore.getState().reconnectSecondsRemaining).toBe(RECONNECT_WINDOW_SECONDS);
    });
  });

  describe("resetReconnectState", () => {
    it("resets all reconnect fields", () => {
      useNetworkStore.getState().setActiveGame("game-123");
      useNetworkStore.getState().setConnected(false);
      vi.advanceTimersByTime(30000);

      useNetworkStore.getState().resetReconnectState();

      const state = useNetworkStore.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.offlineSince).toBeNull();
      expect(state.reconnectSecondsRemaining).toBe(RECONNECT_WINDOW_SECONDS);
      expect(state.reconnectExpired).toBe(false);
    });
  });

  // ==========================================================================
  // Derived hooks
  // ==========================================================================

  describe("isOfflineForGame logic", () => {
    /**
     * useIsOfflineForGame is a React hook so it can't be called outside a
     * component. We test the equivalent derived logic directly from store state:
     *   !isConnected || isReconnecting || reconnectExpired
     */
    function isOfflineForGame() {
      const { isConnected, isReconnecting, reconnectExpired } = useNetworkStore.getState();
      return !isConnected || isReconnecting || reconnectExpired;
    }

    it("returns true when disconnected", () => {
      useNetworkStore.setState({
        isConnected: false,
        isReconnecting: false,
        reconnectExpired: false,
      });
      expect(isOfflineForGame()).toBe(true);
    });

    it("returns true when reconnecting", () => {
      useNetworkStore.setState({
        isConnected: false,
        isReconnecting: true,
        reconnectExpired: false,
      });
      expect(isOfflineForGame()).toBe(true);
    });

    it("returns true when reconnect expired", () => {
      useNetworkStore.setState({
        isConnected: true,
        isReconnecting: false,
        reconnectExpired: true,
      });
      expect(isOfflineForGame()).toBe(true);
    });

    it("returns false when connected and not reconnecting", () => {
      useNetworkStore.setState({
        isConnected: true,
        isReconnecting: false,
        reconnectExpired: false,
      });
      expect(isOfflineForGame()).toBe(false);
    });
  });

  describe("reconnection status shape", () => {
    /**
     * useReconnectionStatus is a React hook. We test the equivalent selector
     * logic directly from store state.
     */
    function getReconnectionStatus() {
      const state = useNetworkStore.getState();
      return {
        isReconnecting: state.isReconnecting,
        secondsRemaining: state.reconnectSecondsRemaining,
        expired: state.reconnectExpired,
        isConnected: state.isConnected,
      };
    }

    it("returns correct shape from store state", () => {
      useNetworkStore.setState({
        isConnected: false,
        isReconnecting: true,
        reconnectSecondsRemaining: 95,
        reconnectExpired: false,
      });

      const status = getReconnectionStatus();
      expect(status).toEqual({
        isReconnecting: true,
        secondsRemaining: 95,
        expired: false,
        isConnected: false,
      });
    });

    it("reflects expired state", () => {
      useNetworkStore.setState({
        isConnected: false,
        isReconnecting: false,
        reconnectSecondsRemaining: 0,
        reconnectExpired: true,
      });

      const status = getReconnectionStatus();
      expect(status.expired).toBe(true);
      expect(status.secondsRemaining).toBe(0);
    });
  });

  // ==========================================================================
  // Offline data access wrappers
  // ==========================================================================

  describe("getOfflineGameSession", () => {
    it("delegates to getCachedActiveGame", async () => {
      const session = { id: "game-1", status: "active" };
      mockGetCachedActiveGame.mockResolvedValue(session);

      const result = await getOfflineGameSession();
      expect(result).toEqual(session);
      expect(mockGetCachedActiveGame).toHaveBeenCalledOnce();
    });

    it("returns null when no cached game exists", async () => {
      mockGetCachedActiveGame.mockResolvedValue(null);

      const result = await getOfflineGameSession();
      expect(result).toBeNull();
    });
  });

  describe("getOfflineSpots", () => {
    it("delegates to getCachedVisitedSpots", async () => {
      const spots = [{ id: "s1", name: "Hubba" }];
      mockGetCachedVisitedSpots.mockResolvedValue(spots);

      const result = await getOfflineSpots();
      expect(result).toEqual(spots);
      expect(mockGetCachedVisitedSpots).toHaveBeenCalledOnce();
    });

    it("returns empty array when no cached spots exist", async () => {
      mockGetCachedVisitedSpots.mockResolvedValue([]);

      const result = await getOfflineSpots();
      expect(result).toEqual([]);
    });
  });

  describe("getOfflineUserProfile", () => {
    it("delegates to getCachedUserProfile", async () => {
      const profile = { uid: "u1", displayName: "Sk8r", email: "s@t.com", photoURL: null };
      mockGetCachedUserProfile.mockResolvedValue(profile);

      const result = await getOfflineUserProfile();
      expect(result).toEqual(profile);
      expect(mockGetCachedUserProfile).toHaveBeenCalledOnce();
    });

    it("returns null when no cached profile exists", async () => {
      mockGetCachedUserProfile.mockResolvedValue(null);

      const result = await getOfflineUserProfile();
      expect(result).toBeNull();
    });
  });
});
