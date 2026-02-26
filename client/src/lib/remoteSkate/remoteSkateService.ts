/**
 * Remote S.K.A.T.E. Game Service
 *
 * Firestore-based game management for video-verified Remote SKATE.
 * Uses the exact data model from the spec:
 *   games/{gameId}
 *   games/{gameId}/rounds/{roundId}
 *   videos/{videoId}
 *
 * @module lib/remoteSkate/remoteSkateService
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  FieldValue,
  type Unsubscribe,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { logger } from "../logger";
import { apiRequest } from "../api/client";

// =============================================================================
// TYPES (matching exact spec)
// =============================================================================

export type GameStatus = "waiting" | "active" | "complete";
export type RoundStatus =
  | "awaiting_set"
  | "awaiting_reply"
  | "awaiting_confirmation"
  | "disputed"
  | "resolved";
export type RoundResult = "landed" | "missed" | null;
export type VideoRole = "set" | "reply";
export type VideoStatus = "uploading" | "ready" | "failed";

export interface GameDoc {
  createdAt: Timestamp | FieldValue | null;
  createdByUid: string;
  playerAUid: string;
  playerBUid: string | null;
  letters: Record<string, string>;
  status: GameStatus;
  currentTurnUid: string;
  lastMoveAt: Timestamp | FieldValue | null;
}

export interface RoundDoc {
  createdAt: Timestamp | FieldValue | null;
  offenseUid: string;
  defenseUid: string;
  status: RoundStatus;
  setVideoId: string | null;
  replyVideoId: string | null;
  result: RoundResult;
  offenseClaim?: RoundResult;
  defenseClaim?: RoundResult;
}

export interface VideoDoc {
  createdAt: Timestamp | FieldValue | null;
  uid: string;
  gameId: string;
  roundId: string;
  role: VideoRole;
  storagePath: string;
  downloadURL: string | null;
  contentType: string;
  sizeBytes: number;
  durationMs: number;
  status: VideoStatus;
  errorCode: string | null;
  errorMessage: string | null;
}

// =============================================================================
// SERVICE
// =============================================================================

export const RemoteSkateService = {
  /**
   * Create a new game. Player A = current user.
   * Creates game doc + first round doc.
   * Returns gameId.
   */
  async createGame(): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in to create a game");

    const gameRef = doc(collection(db, "games"));
    const gameId = gameRef.id;

    const gameData: GameDoc = {
      createdAt: serverTimestamp(),
      createdByUid: user.uid,
      playerAUid: user.uid,
      playerBUid: null,
      letters: { [user.uid]: "" },
      status: "waiting",
      currentTurnUid: user.uid,
      lastMoveAt: serverTimestamp(),
    };

    await setDoc(gameRef, gameData);

    logger.info("[RemoteSkate] Game created", { gameId });
    return gameId;
  },

  /**
   * Join an existing game as Player B.
   * Sets playerBUid, flips status to "active", creates first round.
   */
  async joinGame(gameId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in to join a game");

    const gameRef = doc(db, "games", gameId);
    const gameSnap = await getDoc(gameRef);

    if (!gameSnap.exists()) {
      throw new Error("Game not found");
    }

    const game = gameSnap.data() as GameDoc;

    if (game.playerAUid === user.uid) {
      throw new Error("You cannot join your own game");
    }

    if (game.playerBUid) {
      throw new Error("Game is full");
    }

    if (game.status !== "waiting") {
      throw new Error("Game is no longer available");
    }

    // Update game: set Player B, status=active, currentTurnUid=playerA (offense)
    await updateDoc(gameRef, {
      playerBUid: user.uid,
      [`letters.${user.uid}`]: "",
      status: "active",
      currentTurnUid: game.playerAUid,
      lastMoveAt: serverTimestamp(),
    });

    // Create first round: playerA = offense, playerB = defense
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

    logger.info("[RemoteSkate] Game joined", { gameId, playerB: user.uid });
  },

  /**
   * After set video upload completes and round doc has setVideoId,
   * transition round status to awaiting_reply and update turn.
   */
  async markSetComplete(gameId: string, roundId: string): Promise<void> {
    const roundRef = doc(db, "games", gameId, "rounds", roundId);
    await updateDoc(roundRef, {
      status: "awaiting_reply",
    });

    // Update game: currentTurn = defense
    const roundSnap = await getDoc(roundRef);
    if (roundSnap.exists()) {
      const round = roundSnap.data() as RoundDoc;
      const gameRef = doc(db, "games", gameId);
      await updateDoc(gameRef, {
        currentTurnUid: round.defenseUid,
        lastMoveAt: serverTimestamp(),
      });
    }
  },

  /**
   * After reply video upload completes, update turn back to offense for resolution.
   */
  async markReplyComplete(gameId: string, roundId: string): Promise<void> {
    const roundRef = doc(db, "games", gameId, "rounds", roundId);
    const roundSnap = await getDoc(roundRef);
    if (roundSnap.exists()) {
      const round = roundSnap.data() as RoundDoc;
      const gameRef = doc(db, "games", gameId);
      await updateDoc(gameRef, {
        currentTurnUid: round.offenseUid,
        lastMoveAt: serverTimestamp(),
      });
    }
  },

  // ---------------------------------------------------------------------------
  // SUBSCRIPTIONS
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to game document changes.
   */
  subscribeToGame(
    gameId: string,
    callback: (game: (GameDoc & { id: string }) | null) => void
  ): Unsubscribe {
    const gameRef = doc(db, "games", gameId);
    return onSnapshot(
      gameRef,
      (snapshot) => {
        if (snapshot.exists()) {
          callback({ id: snapshot.id, ...snapshot.data() } as GameDoc & { id: string });
        } else {
          callback(null);
        }
      },
      (error) => {
        logger.error("[RemoteSkate] Game subscription error", error);
        callback(null);
      }
    );
  },

  /**
   * Subscribe to rounds for a game (ordered by creation time).
   */
  subscribeToRounds(
    gameId: string,
    callback: (rounds: (RoundDoc & { id: string })[]) => void
  ): Unsubscribe {
    const roundsRef = collection(db, "games", gameId, "rounds");
    const q = query(roundsRef, orderBy("createdAt", "asc"));

    return onSnapshot(
      q,
      (snapshot) => {
        const rounds = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as (RoundDoc & { id: string })[];
        callback(rounds);
      },
      (error) => {
        logger.error("[RemoteSkate] Rounds subscription error", error);
        callback([]);
      }
    );
  },

  /**
   * Subscribe to a specific video doc.
   */
  subscribeToVideo(
    videoId: string,
    callback: (video: (VideoDoc & { id: string }) | null) => void
  ): Unsubscribe {
    const videoRef = doc(db, "videos", videoId);
    return onSnapshot(
      videoRef,
      (snapshot) => {
        if (snapshot.exists()) {
          callback({ id: snapshot.id, ...snapshot.data() } as VideoDoc & { id: string });
        } else {
          callback(null);
        }
      },
      (error) => {
        logger.error("[RemoteSkate] Video subscription error", error);
        callback(null);
      }
    );
  },

  /**
   * Subscribe to user's games (as playerA or playerB).
   */
  subscribeToMyGames(
    uid: string,
    role: "playerA" | "playerB",
    callback: (games: (GameDoc & { id: string })[]) => void
  ): Unsubscribe {
    const gamesRef = collection(db, "games");
    const field = role === "playerA" ? "playerAUid" : "playerBUid";
    const q = query(gamesRef, where(field, "==", uid));

    return onSnapshot(
      q,
      (snapshot) => {
        const games = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as (GameDoc & { id: string })[];
        callback(games);
      },
      (error) => {
        logger.error("[RemoteSkate] My games subscription error", error);
        callback([]);
      }
    );
  },

  // ---------------------------------------------------------------------------
  // QUICK PLAY — Find or create a game for instant matchmaking
  // ---------------------------------------------------------------------------

  /**
   * Find a random waiting game to join, or create one and notify a random
   * opponent via the server matchmaking endpoint.
   * Returns { gameId, matched: true } if joined an existing game,
   * or { gameId, matched: false, opponentName? } if created one (waiting).
   */
  async findRandomGame(): Promise<{
    gameId: string;
    matched: boolean;
    opponentName?: string;
  }> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in to play");

    // Look for waiting games that aren't ours
    const gamesRef = collection(db, "games");
    const q = query(gamesRef, where("status", "==", "waiting"), limit(10));

    const snapshot = await getDocs(q);

    // Find a game we can join (not created by us)
    for (const gameDoc of snapshot.docs) {
      const data = gameDoc.data() as GameDoc;
      if (data.playerAUid !== user.uid && !data.playerBUid) {
        // Join this game
        await this.joinGame(gameDoc.id);
        logger.info("[RemoteSkate] Quick match found", { gameId: gameDoc.id });
        return { gameId: gameDoc.id, matched: true };
      }
    }

    // Check if we already have a waiting game we created
    const myWaitingQuery = query(
      gamesRef,
      where("status", "==", "waiting"),
      where("playerAUid", "==", user.uid),
      limit(1)
    );
    const myWaitingSnap = await getDocs(myWaitingQuery);
    if (!myWaitingSnap.empty) {
      const existingId = myWaitingSnap.docs[0].id;
      logger.info("[RemoteSkate] Rejoining own waiting game", { gameId: existingId });

      // Re-notify a random opponent so they know the game is still open
      await this.notifyRandomOpponent(existingId);

      return { gameId: existingId, matched: false };
    }

    // No games available — create one and notify a random opponent
    const gameId = await this.createGame();
    const opponentName = await this.notifyRandomOpponent(gameId);

    logger.info("[RemoteSkate] Quick match: created game, notified opponent", {
      gameId,
      opponentName,
    });
    return { gameId, matched: false, opponentName: opponentName ?? undefined };
  },

  /**
   * Call the server matchmaking endpoint to send a push notification
   * to a random eligible user, challenging them to join the given game.
   * Returns the opponent's name if successful, or null on failure.
   */
  async notifyRandomOpponent(gameId: string): Promise<string | null> {
    try {
      const result = await apiRequest<{
        success: boolean;
        match: { opponentId: string; opponentName: string; challengeId: string };
      }>({
        method: "POST",
        path: "/api/matchmaking/quick-match",
        body: { gameId },
      });
      logger.info("[RemoteSkate] Notified random opponent", {
        gameId,
        opponentName: result.match.opponentName,
      });
      return result.match.opponentName;
    } catch (err) {
      // Non-blocking: opponent notification is best-effort
      logger.warn("[RemoteSkate] Failed to notify random opponent", { gameId, err });
      return null;
    }
  },

  /**
   * Cancel a waiting game (delete it if still in waiting status).
   */
  async cancelWaitingGame(gameId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in");

    const gameRef = doc(db, "games", gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return;

    const game = gameSnap.data() as GameDoc;
    if (game.playerAUid !== user.uid) {
      throw new Error("Cannot cancel another player's game");
    }
    if (game.status !== "waiting") return;

    await deleteDoc(gameRef);
    logger.info("[RemoteSkate] Waiting game cancelled", { gameId });
  },

  // ---------------------------------------------------------------------------
  // RESOLVE (calls server API)
  // ---------------------------------------------------------------------------

  /**
   * Submit a round result claim via the trusted server endpoint.
   * Only offense can call this. Transitions round to "awaiting_confirmation".
   */
  async resolveRound(gameId: string, roundId: string, result: "landed" | "missed"): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in");

    const idToken = await user.getIdToken();

    const res = await fetch(`/api/remote-skate/${gameId}/rounds/${roundId}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ result }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Unknown error" }));
      throw new Error(body.message || body.error || `Resolve failed (${res.status})`);
    }
  },

  /**
   * Confirm (or dispute) the offense's round result claim.
   * Only defense can call this. If defense agrees, round is finalized.
   * If defense disagrees, round is flagged as "disputed".
   */
  async confirmRound(
    gameId: string,
    roundId: string,
    result: "landed" | "missed"
  ): Promise<{ disputed: boolean; result?: string }> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in");

    const idToken = await user.getIdToken();

    const res = await fetch(`/api/remote-skate/${gameId}/rounds/${roundId}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ result }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(body.error || `Confirm failed (${res.status})`);
    }

    return res.json();
  },
};
