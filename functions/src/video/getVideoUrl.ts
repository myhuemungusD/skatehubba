/**
 * getVideoUrl Cloud Function
 *
 * Generate a short-lived signed URL for a game video.
 * Verifies the caller is a participant in the game before issuing the URL.
 * This replaces direct Firebase Storage reads which allowed any authenticated
 * user to access any video.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { checkRateLimit } from "../shared/rateLimiter";
import { verifyAppCheck } from "../shared/security";
import { STORAGE_PATH_RE } from "../shared/validation";

interface GetVideoUrlRequest {
  gameId: string;
  storagePath: string;
}

interface GetVideoUrlResponse {
  signedUrl: string;
  expiresAt: string; // ISO 8601
}

export const getVideoUrl = functions.https.onCall(
  async (
    data: GetVideoUrlRequest,
    context: functions.https.CallableContext
  ): Promise<GetVideoUrlResponse> => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    verifyAppCheck(context);
    await checkRateLimit(context.auth.uid);

    const { gameId, storagePath } = data;

    if (!gameId || !storagePath) {
      throw new functions.https.HttpsError("invalid-argument", "Missing gameId or storagePath");
    }

    const userId = context.auth.uid;
    const db = admin.firestore();

    // Check participant membership in game_sessions (mobile flow)
    const gameRef = db.doc(`game_sessions/${gameId}`);
    const gameSnap = await gameRef.get();

    if (gameSnap.exists) {
      const game = gameSnap.data()!;
      if (game.player1Id !== userId && game.player2Id !== userId) {
        throw new functions.https.HttpsError("permission-denied", "Not a participant in this game");
      }
    } else {
      // Fallback: check web games collection (playerAUid/playerBUid)
      const webGameRef = db.doc(`games/${gameId}`);
      const webGameSnap = await webGameRef.get();

      if (!webGameSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Game not found");
      }

      const webGame = webGameSnap.data()!;
      if (webGame.playerAUid !== userId && webGame.playerBUid !== userId) {
        throw new functions.https.HttpsError("permission-denied", "Not a participant in this game");
      }
    }

    // Validate storagePath format after authorization checks.
    // Must match videos/{uid}/{gameId}/{roundId}/{filename}.{ext}
    // Reject path traversal, null bytes, and malformed paths.
    if (
      !storagePath.startsWith("videos/") ||
      storagePath.includes("..") ||
      storagePath.includes("\0") ||
      !STORAGE_PATH_RE.test(storagePath)
    ) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid storage path");
    }

    // Generate signed URL with 1-hour expiry
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const bucket = admin.storage().bucket();
    const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });

    return {
      signedUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }
);
