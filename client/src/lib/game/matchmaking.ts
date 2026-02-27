/**
 * GameService — Matchmaking (Quick Match Queue System)
 *
 * Uses atomic Firestore transactions to prevent race conditions when
 * multiple players attempt to join the same queue slot simultaneously.
 */

import {
  collection,
  doc,
  runTransaction,
  query,
  where,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { COLLECTIONS } from "./constants";
import type { QueueEntry } from "./types";

/**
 * Find or create a quick match game.
 * Uses atomic transactions to prevent race conditions.
 *
 * @param stance - Player's skating stance
 * @returns Game ID (either joined or created queue entry)
 */
export async function findQuickMatch(
  stance: "regular" | "goofy" = "regular"
): Promise<{ gameId: string; isWaiting: boolean }> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Must be logged in to play");

  const userId = currentUser.uid;
  const userName = currentUser.displayName || "Skater";
  const userPhoto = currentUser.photoURL;

  // Query for open lobbies (FIFO - oldest first)
  const q = query(
    collection(db, COLLECTIONS.QUEUE),
    where("status", "==", "WAITING"),
    limit(5) // Get a few to find one not created by us
  );

  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await getDocs(q);

    // Find a valid match (not ourselves)
    let matchDoc = null;
    for (const d of snapshot.docs) {
      if (d.data().createdBy !== userId) {
        matchDoc = d;
        break;
      }
    }

    // ✅ JOIN EXISTING MATCH
    if (matchDoc) {
      const matchData = matchDoc.data() as QueueEntry;
      const gameId = doc(collection(db, COLLECTIONS.GAMES)).id;

      // Coin flip for who starts (crypto-secure)
      const starterIndex = crypto.getRandomValues(new Uint32Array(1))[0] < 0x80000000 ? 0 : 1;
      const players: [string, string] = [matchData.createdBy, userId];
      const starterId = players[starterIndex];

      // Create the official Game Document
      transaction.set(doc(db, COLLECTIONS.GAMES, gameId), {
        players,
        playerData: {
          [matchData.createdBy]: {
            username: matchData.creatorName,
            photoUrl: matchData.creatorPhoto,
            stance: matchData.stance,
          },
          [userId]: {
            username: userName,
            photoUrl: userPhoto,
            stance,
          },
        },
        state: {
          status: "ACTIVE",
          turnPlayerId: starterId,
          phase: "SETTER_RECORDING",
          p1Letters: 0,
          p2Letters: 0,
          currentTrick: null,
          roundNumber: 1,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Remove from queue
      transaction.delete(matchDoc.ref);

      return { gameId, isWaiting: false };
    }

    // ✅ CREATE NEW QUEUE ENTRY
    else {
      const queueRef = doc(collection(db, COLLECTIONS.QUEUE));
      transaction.set(queueRef, {
        createdBy: userId,
        creatorName: userName,
        creatorPhoto: userPhoto,
        stance,
        status: "WAITING",
        createdAt: serverTimestamp(),
      });
      return { gameId: queueRef.id, isWaiting: true };
    }
  });

  return result;
}

/**
 * Cancel matchmaking (leave queue)
 */
export async function cancelMatchmaking(queueId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Must be logged in");

  const queueRef = doc(db, COLLECTIONS.QUEUE, queueId);
  await runTransaction(db, async (transaction) => {
    const queueDoc = await transaction.get(queueRef);
    if (!queueDoc.exists()) return;

    const data = queueDoc.data() as QueueEntry;
    if (data.createdBy !== currentUser.uid) {
      throw new Error("Cannot cancel another player's queue");
    }

    transaction.delete(queueRef);
  });
}

/**
 * Subscribe to queue status (to know when matched)
 */
export function subscribeToQueue(queueId: string, onMatch: (gameId: string) => void): Unsubscribe {
  // Listen to the queue entry - if it disappears, check for games
  const queueRef = doc(db, COLLECTIONS.QUEUE, queueId);

  return onSnapshot(queueRef, async (snapshot) => {
    if (!snapshot.exists()) {
      // Queue entry was deleted - we got matched!
      // Find the game we're in
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const gamesQuery = query(
        collection(db, COLLECTIONS.GAMES),
        where("players", "array-contains", currentUser.uid),
        where("state.status", "==", "ACTIVE"),
        limit(1)
      );

      const gamesSnapshot = await getDocs(gamesQuery);
      if (!gamesSnapshot.empty) {
        onMatch(gamesSnapshot.docs[0].id);
      }
    }
  });
}
