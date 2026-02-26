/**
 * Remote S.K.A.T.E. Service — Mobile
 *
 * Thin client that talks to the same Firestore collections as the web
 * (`games/{gameId}`, `games/{gameId}/rounds/{roundId}`).
 *
 * Only exposes the methods the mobile app needs for the optimized
 * 2-click "Play Random / Search Player" flow.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db, auth } from "./firebase.config";

// ── Types (matching web service & Firestore schema) ─────────────────────────

export type GameStatus = "waiting" | "active" | "complete";

export interface GameDoc {
  createdByUid: string;
  playerAUid: string;
  playerBUid: string | null;
  letters: Record<string, string>;
  status: GameStatus;
  currentTurnUid: string;
}

// ── Service ─────────────────────────────────────────────────────────────────

export const RemoteSkateService = {
  /** Create a new waiting game. Returns the gameId. */
  async createGame(): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in to create a game");

    const gameRef = doc(collection(db, "games"));

    await setDoc(gameRef, {
      createdAt: serverTimestamp(),
      createdByUid: user.uid,
      playerAUid: user.uid,
      playerBUid: null,
      letters: { [user.uid]: "" },
      status: "waiting",
      currentTurnUid: user.uid,
      lastMoveAt: serverTimestamp(),
    });

    return gameRef.id;
  },

  /** Join an existing waiting game as Player B. */
  async joinGame(gameId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in to join a game");

    const gameRef = doc(db, "games", gameId);
    const snap = await getDoc(gameRef);

    if (!snap.exists()) throw new Error("Game not found");
    const game = snap.data() as GameDoc;

    if (game.playerAUid === user.uid) throw new Error("You cannot join your own game");
    if (game.playerBUid) throw new Error("Game is full");
    if (game.status !== "waiting") throw new Error("Game is no longer available");

    await updateDoc(gameRef, {
      playerBUid: user.uid,
      status: "active",
      [`letters.${user.uid}`]: "",
      lastMoveAt: serverTimestamp(),
    });

    // Create the first round
    const roundRef = doc(collection(db, "games", gameId, "rounds"));
    await setDoc(roundRef, {
      createdAt: serverTimestamp(),
      offenseUid: game.playerAUid,
      defenseUid: user.uid,
      status: "awaiting_set",
      setVideoId: null,
      replyVideoId: null,
      result: null,
    });
  },

  /**
   * Find a random waiting game to join, or create one.
   * Returns { gameId, matched: true } when joined, or { gameId, matched: false }
   * if a new game was created and is waiting for an opponent.
   */
  async findRandomGame(): Promise<{ gameId: string; matched: boolean }> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in to play");

    const gamesRef = collection(db, "games");
    const q = query(gamesRef, where("status", "==", "waiting"), limit(10));
    const snapshot = await getDocs(q);

    // Try to find a joinable game (not ours, not full)
    for (const gameDoc of snapshot.docs) {
      const data = gameDoc.data() as GameDoc;
      if (data.playerAUid !== user.uid && !data.playerBUid) {
        await this.joinGame(gameDoc.id);
        return { gameId: gameDoc.id, matched: true };
      }
    }

    // Check if we already have a waiting game
    const myWaitingQ = query(
      gamesRef,
      where("status", "==", "waiting"),
      where("playerAUid", "==", user.uid),
      limit(1)
    );
    const mySnap = await getDocs(myWaitingQ);
    if (!mySnap.empty) {
      return { gameId: mySnap.docs[0].id, matched: false };
    }

    // Create a new game
    const gameId = await this.createGame();
    return { gameId, matched: false };
  },

  /** Cancel a waiting game (delete if still waiting and owned by us). */
  async cancelWaitingGame(gameId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in");

    const gameRef = doc(db, "games", gameId);
    const snap = await getDoc(gameRef);
    if (!snap.exists()) return;

    const game = snap.data() as GameDoc;
    if (game.playerAUid !== user.uid) throw new Error("Cannot cancel another player's game");
    if (game.status !== "waiting") return;

    await deleteDoc(gameRef);
  },

  /** Subscribe to a game doc. Calls back with the game data or null. */
  subscribeToGame(
    gameId: string,
    callback: (game: (GameDoc & { id: string }) | null) => void
  ): Unsubscribe {
    return onSnapshot(
      doc(db, "games", gameId),
      (snap) => {
        if (snap.exists()) {
          callback({ id: snap.id, ...(snap.data() as GameDoc) });
        } else {
          callback(null);
        }
      },
      () => callback(null)
    );
  },
};
