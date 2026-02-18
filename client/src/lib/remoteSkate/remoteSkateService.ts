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
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  FieldValue,
  type Unsubscribe,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { logger } from "../logger";

// =============================================================================
// TYPES (matching exact spec)
// =============================================================================

export type GameStatus = "waiting" | "active" | "complete";
export type RoundStatus = "awaiting_set" | "awaiting_reply" | "awaiting_confirmation" | "disputed" | "resolved";
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
