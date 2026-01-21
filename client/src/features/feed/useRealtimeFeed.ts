import { useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { listenToCollection, type ListenerError } from "@/lib/firestore/listeners";
import { firestoreCollections } from "@/lib/firestore/operations";

export interface FeedCheckIn {
  id: string;
  spotId: string;
  spotName: string;
  displayName: string;
  trick?: string;
  points?: number;
  checkedInAt: Date;
  photoUrl?: string;
}

interface FirestoreCheckIn {
  id: string;
  spotId?: string;
  spotName?: string;
  displayName?: string;
  trick?: string;
  points?: number;
  checkedInAt?: Timestamp | Date | string;
  photoUrl?: string;
}

const toDate = (value: Timestamp | Date | string | undefined): Date => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const toFeedCheckIn = (item: FirestoreCheckIn): FeedCheckIn => {
  return {
    id: item.id,
    spotId: item.spotId ?? "unknown",
    spotName: item.spotName ?? "Unknown spot",
    displayName: item.displayName ?? "Skater",
    trick: item.trick,
    points: item.points,
    checkedInAt: toDate(item.checkedInAt),
    photoUrl: item.photoUrl,
  };
};

export const useRealtimeFeed = () => {
  const [items, setItems] = useState<FeedCheckIn[]>([]);
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

    const unsubscribe = listenToCollection<FirestoreCheckIn>(
      firestoreCollections.activeCheckins,
      [],
      (docs) => {
        setItems(
          docs.map(toFeedCheckIn).sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime())
        );
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
      items,
      isLoading,
      error,
      isOffline,
    }),
    [items, isLoading, error, isOffline]
  );

  return state;
};
