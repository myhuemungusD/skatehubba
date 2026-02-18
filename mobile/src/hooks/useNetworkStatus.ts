import { useEffect, useRef } from "react";
import * as Network from "expo-network";
import { AppState, AppStateStatus } from "react-native";
import { useNetworkStore } from "@/store/networkStore";

/**
 * Hook to monitor network connectivity and update the network store.
 * Should be used once at the app root level.
 */
export function useNetworkStatus() {
  const setConnected = useNetworkStore((state) => state.setConnected);
  const isInitialized = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Check initial network state
    const checkNetworkStatus = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();
        if (mounted) {
          const connected = networkState.isConnected && networkState.isInternetReachable;
          setConnected(connected !== false);
          isInitialized.current = true;
        }
      } catch (error) {
        console.error("[useNetworkStatus] Failed to check network state:", error);
        // Assume connected on error to avoid false positives
        if (mounted) {
          setConnected(true);
        }
      }
    };

    // Check network status when app returns to foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        checkNetworkStatus();
      }
    };

    // Initial check
    checkNetworkStatus();

    // Set up polling interval (expo-network doesn't have subscription API).
    // 15s is sufficient: AppState "active" handler (above) catches the most
    // critical case, and 15s is well within the 120s reconnection window.
    const intervalId = setInterval(checkNetworkStatus, 15_000);

    // Listen for app state changes
    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [setConnected]);
}

/**
 * Hook to check current network connectivity status.
 * Returns true if connected, false if offline.
 */
export function useIsConnected() {
  return useNetworkStore((state) => state.isConnected);
}
