import { useEffect } from "react";
import { showMessage } from "react-native-flash-message";
import { checkDeviceIntegrity } from "@/lib/deviceIntegrity";
import { logEvent } from "@/lib/analytics/logEvent";

/**
 * Warn users on jailbroken / rooted devices at app startup.
 *
 * Should be called once in the root layout (_layout.tsx).
 * Shows a flash message and fires an analytics event when the
 * device appears compromised.
 */
export function useDeviceIntegrity(): void {
  const result = checkDeviceIntegrity();

  useEffect(() => {
    if (!result.isCompromised) return;

    showMessage({
      message: "Security Warning",
      description:
        "This device appears to be jailbroken or rooted. " +
        "Some features may be restricted for your security.",
      type: "warning",
      duration: 6000,
      icon: "warning",
    });

    logEvent("device_integrity_warning", {
      isJailbroken: result.isJailbroken,
      hookDetected: result.hookDetected,
    });
  }, [result.isCompromised, result.isJailbroken, result.hookDetected]);
}
