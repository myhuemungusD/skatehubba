/**
 * Remote S.K.A.T.E. Game Service
 *
 * Firestore-based game management for video-verified Remote SKATE.
 * Uses the exact data model from the spec:
 *   games/{gameId}
 *   games/{gameId}/rounds/{roundId}
 *   videos/{videoId}
 *
 * Game mutations (join, cancel, round transitions) go through the server
 * API for atomicity and security. Reads use Firestore real-time subscriptions.
 *
 * @module lib/remoteSkate/remoteSkateService
 */

import {
  collection,
  doc,
  setDoc,
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
import { apiRequest } from "../api/client";

// =============================================================================
// TYPES (matching exact spec)
// =============================================================================

export type GameStatus = "waiting" | "active" | "complete" | "cancelled";
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
// HELPERS — authenticated fetch to the remote-skate API
// =============================================================================

async function remoteSkateApi<T = unknown>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in");

  return apiRequest<T>({
    method: "POST",
    path: `/api/remote-skate${path}`,
    body,
  });
}

// =============================================================================
// SERVICE
// =============================================================================

export const RemoteSkateService = {
  /**
   * Create a new game. Player A = current user.
   * Creates game doc via Firestore client SDK (allowed by rules).
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
   * Join an existing game as Player B via the server API.
   * The server uses a Firestore transaction to atomically:
   * - Set playerBUid, status=active, currentTurnUid
   * - Create the first round
   */
  async joinGame(gameId: string): Promise<void> {
    await remoteSkateApi(`/${gameId}/join`);
    logger.info("[RemoteSkate] Game joined", { gameId });
  },

  /**
   * After set video upload completes, call the server to atomically
   * transition round status to awaiting_reply and update game turn.
   */
  async markSetComplete(gameId: string, roundId: string): Promise<void> {
    await remoteSkateApi(`/${gameId}/rounds/${roundId}/set-complete`);
  },

  /**
   * After reply video upload completes, call the server to atomically
   * update game turn back to offense for resolution.
   */
  async markReplyComplete(gameId: string, roundId: string): Promise<void> {
    await remoteSkateApi(`/${gameId}/rounds/${roundId}/reply-complete`);
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
  // QUICK PLAY — Server-side matchmaking
  // ---------------------------------------------------------------------------

  /**
   * Find a random waiting game to join, or create one, via the server API.
   * The server uses Admin SDK (bypasses Firestore read rules) to query all
   * waiting games, not just the current user's.
   *
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

    const result = await remoteSkateApi<{
      success: boolean;
      gameId: string;
      matched: boolean;
    }>("/find-or-create");

    if (result.matched) {
      logger.info("[RemoteSkate] Quick match found", { gameId: result.gameId });
      return { gameId: result.gameId, matched: true };
    }

    // Created or re-joined our own waiting game — notify a random opponent
    const opponentName = await this.notifyRandomOpponent(result.gameId);
    logger.info("[RemoteSkate] Quick match: created/rejoined game", {
      gameId: result.gameId,
      opponentName,
    });
    return { gameId: result.gameId, matched: false, opponentName: opponentName ?? undefined };
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
   * Cancel a waiting game via the server API.
   * Sets status to "cancelled" (Firestore rules block delete on games).
   */
  async cancelWaitingGame(gameId: string): Promise<void> {
    await remoteSkateApi(`/${gameId}/cancel`);
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
    await remoteSkateApi(`/${gameId}/rounds/${roundId}/resolve`, { result });
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
    return remoteSkateApi<{ disputed: boolean; result?: string }>(
      `/${gameId}/rounds/${roundId}/confirm`,
      { result }
    );
  },
};
