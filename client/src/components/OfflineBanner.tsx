import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

/**
 * Displays a persistent banner when the user loses network connectivity.
 * Automatically hides when connection is restored.
 * Addresses gap 5.1: No offline error state.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2"
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      You are offline. Some features may be unavailable.
    </div>
  );
}
