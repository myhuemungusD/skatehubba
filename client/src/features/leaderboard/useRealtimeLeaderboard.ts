import { useEffect, useMemo, useState } from "react";
import { listenToCollection, type ListenerError } from "@/lib/firestore/listeners";
import { firestoreCollections } from "@/lib/firestore/operations";

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  username?: string;
  points?: number;
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
  points?: number;
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
    points: item.points,
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
    if (a.points !== undefined && b.points !== undefined) return b.points - a.points;
    return a.displayName.localeCompare(b.displayName);
  });
};

export const useRealtimeLeaderboard = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ListenerError | null>(null);
  const [isOffline, setIsOffline] = useState(false);

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
        setEntries(sortEntries(normalized));
        setIsLoading(false);
      },
      (err) => {
        setError(err);
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
    }),
    [entries, isLoading, error, isOffline]
  );

  return state;
};
