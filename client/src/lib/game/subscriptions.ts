/**
 * GameService — Real-time Subscriptions & Queries
 *
 * Provides Firestore listeners and one-shot queries for game state.
 */

import {
  collection,
  doc,
  query,
  where,
  getDocs,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { logger } from "../logger";
import { COLLECTIONS } from "./constants";
import type { GameDocument } from "./types";

/**
 * Subscribe to game state changes.
 */
export function subscribeToGame(
  gameId: string,
  callback: (game: GameDocument | null) => void
): Unsubscribe {
  const gameRef = doc(db, COLLECTIONS.GAMES, gameId);

  return onSnapshot(
    gameRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() } as GameDocument);
      } else {
        callback(null);
      }
    },
    (error) => {
      logger.error("[GameService] Subscription error:", error);
      callback(null);
    }
  );
}

/**
 * Get active games for current user.
 */
export async function getActiveGames(): Promise<GameDocument[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  const gamesQuery = query(
    collection(db, COLLECTIONS.GAMES),
    where("players", "array-contains", currentUser.uid),
    where("state.status", "in", ["ACTIVE", "PENDING_ACCEPT"])
  );

  const snapshot = await getDocs(gamesQuery);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GameDocument);
}
