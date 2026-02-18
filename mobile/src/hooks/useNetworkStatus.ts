import { useEffect, useRef } from "react";
import * as Network from "expo-network";
import { AppState, AppStateStatus } from "react-native";
import { useNetworkStore } from "@/store/networkStore";

/**
 * Network polling interval in milliseconds.
 * 15s is well within the 120s reconnection window, and the AppState "active"
 * handler catches the most critical foreground transition immediately.
 */
const NETWORK_POLL_INTERVAL_MS = 15 * 1000;

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

    // Set up polling interval (expo-network doesn't have a subscription API)
    const intervalId = setInterval(checkNetworkStatus, NETWORK_POLL_INTERVAL_MS);

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
