import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

admin.initializeApp();

export const createChallenge = functions.https.onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Log in bro");
  }

  const { opponentUid, clipUrl, thumbnailUrl } = request.data;
  if (!opponentUid || !clipUrl || !thumbnailUrl) {
    throw new functions.https.HttpsError("invalid-argument", "Missing data");
  }

  const challengeRef = admin.firestore().collection("challenges").doc();
  const deadline = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );

  await challengeRef.set({
    id: challengeRef.id,
    createdBy: request.auth.uid,
    opponent: opponentUid,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    deadline,
    rules: { oneTake: true, durationSec: 15 },
    clipA: { url: clipUrl, thumbnailUrl, durationSec: 15 },
  });

  // FCM notify opponent
  const opponent = await admin.firestore().doc(`users/${opponentUid}`).get();
  const token = opponent.get("fcmToken");
  if (token) {
    await admin.messaging().send({
      token,
      notification: { title: "Challenge Incoming!", body: "24h or forfeit" },
      data: { type: "challenge", id: challengeRef.id },
    });
  }

  return { success: true, challengeId: challengeRef.id };
});
