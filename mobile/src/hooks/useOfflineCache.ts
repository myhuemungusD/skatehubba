/**
 * Offline Cache Hook
 *
 * Syncs active game sessions, visited spots, and the user profile
 * to AsyncStorage whenever they change while online, so data remains
 * available when connectivity drops.
 */

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { useNetworkStore } from "@/store/networkStore";
import {
  cacheActiveGame,
  cacheUserProfile,
  cacheVisitedSpots,
  clearCachedActiveGame,
  clearOfflineCache,
} from "@/lib/offlineCache";
import { queryClient } from "@/lib/queryClient";
import type { GameSession, Spot } from "@/types";

/**
 * Watches key data sources and caches them for offline use.
 * Call once at the app root level.
 */
export function useOfflineCache() {
  const user = useAuthStore((state) => state.user);
  const isConnected = useNetworkStore((state) => state.isConnected);
  const prevUser = useRef(user);

  // Cache user profile whenever auth state changes while online
  useEffect(() => {
    if (!user || !isConnected) return;

    cacheUserProfile({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    });
  }, [user, isConnected]);

  // Clear offline cache on sign-out
  useEffect(() => {
    if (prevUser.current && !user) {
      clearOfflineCache();
    }
    prevUser.current = user;
  }, [user]);

  // Watch React Query cache for spots data and persist when it changes
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;

      const queryKey = event.query.queryKey;
      if (!Array.isArray(queryKey)) return;

      const key = queryKey[0] as string;

      // Cache spots when fetched
      if (key === "/api/spots") {
        const data = event.query.state.data as Spot[] | undefined;
        if (data && Array.isArray(data)) {
          cacheVisitedSpots(data);
        }
      }
    });

    return () => unsubscribe();
  }, [isConnected]);
}

/**
 * Cache an active game session. Call this from game screen components
 * whenever the session updates from Firestore.
 */
export function useCacheGameSession(session: GameSession | null | undefined) {
  const isConnected = useNetworkStore((state) => state.isConnected);

  useEffect(() => {
    if (!isConnected) return;

    if (session && (session.status === "active" || session.status === "waiting")) {
      cacheActiveGame(session);
    } else if (session?.status === "completed" || session?.status === "abandoned") {
      clearCachedActiveGame();
    }
  }, [session, isConnected]);
}
