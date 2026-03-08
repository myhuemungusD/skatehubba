import { useLeaderboard } from "@/hooks/useSkateGameApi";

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  username?: string;
  wins: number;
  losses: number;
  rank?: number;
  avatarUrl?: string;
}

export const useRealtimeLeaderboard = () => {
  const { data, isLoading, error } = useLeaderboard();

  const entries: LeaderboardEntry[] = data?.entries ?? [];

  return {
    entries,
    isLoading,
    error: error ? { code: "API_ERROR", message: error.message } : null,
    isOffline: typeof navigator !== "undefined" && !navigator.onLine,
    /** No longer applicable — always false when using real API data */
    isFallback: false,
  };
};
