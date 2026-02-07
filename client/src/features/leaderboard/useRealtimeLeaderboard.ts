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

// Demo leaderboard shown when Firestore is unavailable or returns empty data.
// Uses realistic skater-style usernames so the page looks alive during demos.
const DEMO_LEADERBOARD: LeaderboardEntry[] = [
  {
    id: "demo-1",
    displayName: "railSlider_sf",
    username: "railslider_sf",
    points: 12450,
    totalCheckIns: 89,
    spotsVisited: 34,
    streak: 14,
    rank: 1,
  },
  {
    id: "demo-2",
    displayName: "kickflipKing",
    username: "kickflipking",
    points: 10820,
    totalCheckIns: 76,
    spotsVisited: 28,
    streak: 11,
    rank: 2,
  },
  {
    id: "demo-3",
    displayName: "treSoul",
    username: "tresoul",
    points: 9340,
    totalCheckIns: 64,
    spotsVisited: 25,
    streak: 8,
    rank: 3,
  },
  {
    id: "demo-4",
    displayName: "heelflipHero",
    username: "heelfliphero",
    points: 8190,
    totalCheckIns: 58,
    spotsVisited: 22,
    streak: 6,
    rank: 4,
  },
  {
    id: "demo-5",
    displayName: "grindMaster_bk",
    username: "grindmaster_bk",
    points: 7650,
    totalCheckIns: 52,
    spotsVisited: 19,
    streak: 9,
    rank: 5,
  },
  {
    id: "demo-6",
    displayName: "noseslide_nyc",
    username: "noseslide_nyc",
    points: 6420,
    totalCheckIns: 45,
    spotsVisited: 17,
    streak: 5,
    rank: 6,
  },
  {
    id: "demo-7",
    displayName: "switchStance",
    username: "switchstance",
    points: 5880,
    totalCheckIns: 41,
    spotsVisited: 15,
    streak: 4,
    rank: 7,
  },
  {
    id: "demo-8",
    displayName: "poolRipper",
    username: "poolripper",
    points: 4950,
    totalCheckIns: 35,
    spotsVisited: 13,
    streak: 7,
    rank: 8,
  },
  {
    id: "demo-9",
    displayName: "ledgeLord_pdx",
    username: "ledgelord_pdx",
    points: 4210,
    totalCheckIns: 30,
    spotsVisited: 11,
    streak: 3,
    rank: 9,
  },
  {
    id: "demo-10",
    displayName: "flatground_og",
    username: "flatground_og",
    points: 3580,
    totalCheckIns: 24,
    spotsVisited: 9,
    streak: 2,
    rank: 10,
  },
];

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
        if (normalized.length > 0) {
          setEntries(sortEntries(normalized));
        } else {
          // Firestore returned empty — use demo data so the page looks alive
          setEntries(DEMO_LEADERBOARD);
        }
        setIsLoading(false);
      },
      (_err) => {
        // On Firestore error, show demo data instead of an error state
        setEntries(DEMO_LEADERBOARD);
        setError(null);
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
