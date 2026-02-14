import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useNetworkStore } from "./networkStore";

describe("networkStore", () => {
  beforeEach(() => {
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
      expect(state.reconnectSecondsRemaining).toBe(120);
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
      expect(state.reconnectSecondsRemaining).toBe(120);
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

      expect(useNetworkStore.getState().reconnectSecondsRemaining).toBe(120);
    });

    it("is a no-op when offlineSince is null", () => {
      useNetworkStore.setState({ isConnected: false, offlineSince: null });
      useNetworkStore.getState().updateReconnectTimer();

      expect(useNetworkStore.getState().reconnectSecondsRemaining).toBe(120);
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
      expect(state.reconnectSecondsRemaining).toBe(120);
      expect(state.reconnectExpired).toBe(false);
    });
  });
});
