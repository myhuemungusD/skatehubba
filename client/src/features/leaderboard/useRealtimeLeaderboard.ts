import { useEffect, useMemo, useState } from "react";
import { listenToCollection, type ListenerError } from "@/lib/firestore/listeners";
import { firestoreCollections } from "@/lib/firestore/operations";
import { DEMO_LEADERBOARD } from "@/lib/demo-data";

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  username?: string;
  xp?: number;
  totalCheckIns?: number;
  spotsVisited?: number;
  streak?: number;
  rank?: number;
  avatarUrl?: string;
}

interface FirestoreLeaderboardEntry {
  id: string;
  displayName?: string;
  username?: string;
  xp?: number;
  totalCheckIns?: number;
  spotsVisited?: number;
  streak?: number;
  rank?: number;
  avatarUrl?: string;
}

const toLeaderboardEntry = (item: FirestoreLeaderboardEntry): LeaderboardEntry => {
  return {
    id: item.id,
    displayName: item.displayName ?? "Skater",
    username: item.username,
    xp: item.xp,
    totalCheckIns: item.totalCheckIns,
    spotsVisited: item.spotsVisited,
    streak: item.streak,
    rank: item.rank,
    avatarUrl: item.avatarUrl,
  };
};

const sortEntries = (entries: LeaderboardEntry[]) => {
  return [...entries].sort((a, b) => {
    if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
    if (a.xp !== undefined && b.xp !== undefined) return b.xp - a.xp;
    return a.displayName.localeCompare(b.displayName);
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
