import { create } from "zustand";
import {
  getCachedActiveGame,
  getCachedVisitedSpots,
  getCachedUserProfile,
  type CachedUserProfile,
} from "@/lib/offlineCache";
import type { GameSession, Spot } from "@/types";

/** Reconnection window in milliseconds (120 seconds) */
export const RECONNECT_WINDOW_MS = 120 * 1000;

/** Reconnection window in whole seconds, derived from {@link RECONNECT_WINDOW_MS} */
export const RECONNECT_WINDOW_SECONDS = RECONNECT_WINDOW_MS / 1000;

interface NetworkState {
  /** Current network connectivity status */
  isConnected: boolean;
  /** Whether we're within the reconnection grace period */
  isReconnecting: boolean;
  /** Timestamp when we went offline (null if online) */
  offlineSince: number | null;
  /** Remaining seconds in reconnection window */
  reconnectSecondsRemaining: number;
  /** Whether the reconnection window has expired (game should be abandoned) */
  reconnectExpired: boolean;
  /** Game ID that was active when disconnection occurred */
  activeGameIdOnDisconnect: string | null;
}

interface NetworkActions {
  setConnected: (connected: boolean) => void;
  setActiveGame: (gameId: string | null) => void;
  updateReconnectTimer: () => void;
  resetReconnectState: () => void;
}

type NetworkStore = NetworkState & NetworkActions;

const initialState: NetworkState = {
  isConnected: true,
  isReconnecting: false,
  offlineSince: null,
  reconnectSecondsRemaining: RECONNECT_WINDOW_SECONDS,
  reconnectExpired: false,
  activeGameIdOnDisconnect: null,
};

let reconnectIntervalId: ReturnType<typeof setInterval> | null = null;

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  ...initialState,

  setConnected: (connected: boolean) => {
    const state = get();

    if (connected && !state.isConnected) {
      // Coming back online
      const wasExpired = state.reconnectExpired;

      // Clear the timer
      if (reconnectIntervalId) {
        clearInterval(reconnectIntervalId);
        reconnectIntervalId = null;
      }

      set({
        isConnected: true,
        isReconnecting: false,
        offlineSince: null,
        reconnectSecondsRemaining: RECONNECT_WINDOW_SECONDS,
        // Keep reconnectExpired state to inform UI of failed reconnection
        reconnectExpired: wasExpired,
      });
    } else if (!connected && state.isConnected) {
      // Going offline
      const now = Date.now();

      set({
        isConnected: false,
        isReconnecting: state.activeGameIdOnDisconnect !== null,
        offlineSince: now,
        reconnectSecondsRemaining: RECONNECT_WINDOW_SECONDS,
        reconnectExpired: false,
      });

      // Start countdown timer only if in an active game
      if (state.activeGameIdOnDisconnect !== null) {
        if (reconnectIntervalId) {
          clearInterval(reconnectIntervalId);
        }

        reconnectIntervalId = setInterval(() => {
          get().updateReconnectTimer();
        }, 1000);
      }
    }
  },

  setActiveGame: (gameId: string | null) => {
    set({ activeGameIdOnDisconnect: gameId });

    // If we're already offline and now have an active game, start the timer
    const state = get();
    if (!state.isConnected && gameId !== null && !reconnectIntervalId) {
      set({
        isReconnecting: true,
        offlineSince: Date.now(),
        reconnectSecondsRemaining: RECONNECT_WINDOW_SECONDS,
      });

      reconnectIntervalId = setInterval(() => {
        get().updateReconnectTimer();
      }, 1000);
    }

    // If game ends, stop timer
    if (gameId === null && reconnectIntervalId) {
      clearInterval(reconnectIntervalId);
      reconnectIntervalId = null;
      set({ isReconnecting: false });
    }
  },

  updateReconnectTimer: () => {
    const state = get();

    if (!state.offlineSince || state.isConnected) {
      return;
    }

    const elapsed = Date.now() - state.offlineSince;
    const remaining = Math.max(0, RECONNECT_WINDOW_MS - elapsed);
    const secondsRemaining = Math.ceil(remaining / 1000);

    if (secondsRemaining <= 0) {
      // Timer expired
      if (reconnectIntervalId) {
        clearInterval(reconnectIntervalId);
        reconnectIntervalId = null;
      }

      set({
        reconnectSecondsRemaining: 0,
        reconnectExpired: true,
        isReconnecting: false,
      });
    } else {
      set({
        reconnectSecondsRemaining: secondsRemaining,
      });
    }
  },

  resetReconnectState: () => {
    if (reconnectIntervalId) {
      clearInterval(reconnectIntervalId);
      reconnectIntervalId = null;
    }
    set({
      reconnectExpired: false,
      reconnectSecondsRemaining: RECONNECT_WINDOW_SECONDS,
      offlineSince: null,
      isReconnecting: false,
    });
  },
}));

/** Hook to check if we're in an offline state that affects gameplay */
export function useIsOfflineForGame() {
  const { isConnected, isReconnecting, reconnectExpired } = useNetworkStore();
  return !isConnected || isReconnecting || reconnectExpired;
}

/** Hook to get reconnection status for UI display */
export function useReconnectionStatus() {
  return useNetworkStore((state) => ({
    isReconnecting: state.isReconnecting,
    secondsRemaining: state.reconnectSecondsRemaining,
    expired: state.reconnectExpired,
    isConnected: state.isConnected,
  }));
}

// ============================================================================
// Offline data access — read from AsyncStorage cache when offline
// ============================================================================

/**
 * Get the cached active game session (for offline viewing).
 * Returns null when online or if no cached data exists.
 */
export async function getOfflineGameSession(): Promise<GameSession | null> {
  return getCachedActiveGame();
}

/**
 * Get cached visited spots (for offline browsing).
 */
export async function getOfflineSpots(): Promise<Spot[]> {
  return getCachedVisitedSpots();
}

/**
 * Get cached user profile (for offline display).
 */
export async function getOfflineUserProfile(): Promise<CachedUserProfile | null> {
  return getCachedUserProfile();
}
