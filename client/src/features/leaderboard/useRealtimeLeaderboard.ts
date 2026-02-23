import { useEffect, useMemo, useState } from "react";
import { listenToCollection, type ListenerError } from "@/lib/firestore/listeners";
import { firestoreCollections } from "@/lib/firestore/operations";
import { DEMO_LEADERBOARD } from "@/lib/demo-data";

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  username?: string;
  wins: number;
  losses: number;
  rank?: number;
  avatarUrl?: string;
}

interface FirestoreLeaderboardEntry {
  id: string;
  displayName?: string;
  username?: string;
  wins?: number;
  losses?: number;
  rank?: number;
  avatarUrl?: string;
}

const toLeaderboardEntry = (item: FirestoreLeaderboardEntry): LeaderboardEntry => {
  return {
    id: item.id,
    displayName: item.displayName ?? "Skater",
    username: item.username,
    wins: item.wins ?? 0,
    losses: item.losses ?? 0,
    rank: item.rank,
    avatarUrl: item.avatarUrl,
  };
};

const sortEntries = (entries: LeaderboardEntry[]) => {
  return [...entries].sort((a, b) => {
    if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
    return b.wins - a.wins;
  });
};

export const useRealtimeLeaderboard = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ListenerError | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    };

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    const unsubscribe = listenToCollection<FirestoreLeaderboardEntry>(
      firestoreCollections.leaderboardLive,
      [],
      (docs) => {
        const normalized = docs.map(toLeaderboardEntry);
        if (normalized.length > 0) {
          setEntries(sortEntries(normalized));
          setIsFallback(false);
        } else {
          // Firestore returned empty — show demo data so the page isn't blank
          setEntries(DEMO_LEADERBOARD);
          setIsFallback(true);
        }
        setIsLoading(false);
      },
      (err) => {
        // Keep the error visible to consumers but still show demo data
        // so the UI isn't a blank error screen
        setError(err);
        setEntries(DEMO_LEADERBOARD);
        setIsFallback(true);
        setIsLoading(false);
      }
    );

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      unsubscribe();
    };
  }, []);

  const state = useMemo(
    () => ({
      entries,
      isLoading,
      error,
      isOffline,
      /** True when showing demo data instead of real Firestore data */
      isFallback,
    }),
    [entries, isLoading, error, isOffline, isFallback]
  );

  return state;
};
