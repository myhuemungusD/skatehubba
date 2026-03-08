import { useEffect, useState } from "react";
import { useLeaderboard } from "@/hooks/useSkateGameApi";

export type { LeaderboardEntry } from "@/lib/api/game/types";

export const useRealtimeLeaderboard = () => {
  const { data, isLoading, error } = useLeaderboard();
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return {
    entries: data?.entries ?? [],
    isLoading,
    error: error ? { code: "API_ERROR", message: error.message } : null,
    isOffline,
  };
};
