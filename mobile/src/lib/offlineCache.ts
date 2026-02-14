/**
 * Offline Cache Service
 *
 * Persists active game state, visited spots, and user profile to AsyncStorage
 * so the app remains usable without network connectivity.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GameSession, Spot } from "@/types";

const CACHE_KEYS = {
  ACTIVE_GAME: "skatehubba_offline_active_game",
  VISITED_SPOTS: "skatehubba_offline_visited_spots",
  USER_PROFILE: "skatehubba_offline_user_profile",
  CACHE_TIMESTAMPS: "skatehubba_offline_timestamps",
} as const;

/** Max age before cached data is considered stale (24 hours) */
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

/** Lightweight profile shape stored in offline cache */
export interface CachedUserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface CacheTimestamps {
  activeGame?: number;
  visitedSpots?: number;
  userProfile?: number;
}

// ============================================================================
// Active Game State
// ============================================================================

export async function cacheActiveGame(session: GameSession): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.ACTIVE_GAME, JSON.stringify(session));
    await updateTimestamp("activeGame");
  } catch {
    // Non-critical
  }
}

export async function getCachedActiveGame(): Promise<GameSession | null> {
  try {
    if (await isStale("activeGame")) return null;
    const data = await AsyncStorage.getItem(CACHE_KEYS.ACTIVE_GAME);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function clearCachedActiveGame(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEYS.ACTIVE_GAME);
  } catch {
    // Non-critical
  }
}

// ============================================================================
// Visited Spots
// ============================================================================

export async function cacheVisitedSpots(spots: Spot[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.VISITED_SPOTS, JSON.stringify(spots));
    await updateTimestamp("visitedSpots");
  } catch {
    // Non-critical
  }
}

export async function getCachedVisitedSpots(): Promise<Spot[]> {
  try {
    if (await isStale("visitedSpots")) return [];
    const data = await AsyncStorage.getItem(CACHE_KEYS.VISITED_SPOTS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// ============================================================================
// User Profile
// ============================================================================

export async function cacheUserProfile(profile: CachedUserProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.USER_PROFILE, JSON.stringify(profile));
    await updateTimestamp("userProfile");
  } catch {
    // Non-critical
  }
}

export async function getCachedUserProfile(): Promise<CachedUserProfile | null> {
  try {
    if (await isStale("userProfile")) return null;
    const data = await AsyncStorage.getItem(CACHE_KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Clear all offline cache (e.g. on sign-out)
// ============================================================================

export async function clearOfflineCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      CACHE_KEYS.ACTIVE_GAME,
      CACHE_KEYS.VISITED_SPOTS,
      CACHE_KEYS.USER_PROFILE,
      CACHE_KEYS.CACHE_TIMESTAMPS,
    ]);
  } catch {
    // Non-critical
  }
}

// ============================================================================
// Timestamp helpers
// ============================================================================

async function getTimestamps(): Promise<CacheTimestamps> {
  try {
    const data = await AsyncStorage.getItem(CACHE_KEYS.CACHE_TIMESTAMPS);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

async function updateTimestamp(key: keyof CacheTimestamps): Promise<void> {
  try {
    const timestamps = await getTimestamps();
    timestamps[key] = Date.now();
    await AsyncStorage.setItem(CACHE_KEYS.CACHE_TIMESTAMPS, JSON.stringify(timestamps));
  } catch {
    // Non-critical
  }
}

async function isStale(key: keyof CacheTimestamps): Promise<boolean> {
  const timestamps = await getTimestamps();
  const ts = timestamps[key];
  if (!ts) return true;
  return Date.now() - ts > MAX_CACHE_AGE_MS;
}
