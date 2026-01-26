import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

interface SubmitClaimPayload {
  bountyId: string;
  clipStoragePath: string;
  durationSeconds?: number;
  filmerUid?: string;
}

const CLAIM_PATH_REGEX = /^claims\/([^/]+)\/([^/]+)\.mp4$/;

export const submitClaim = functions.https.onCall(
  async (data: SubmitClaimPayload, context: functions.https.CallableContext) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }

    const { bountyId, clipStoragePath, durationSeconds, filmerUid } = data;

    if (!bountyId || typeof bountyId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "bountyId is required.");
    }

    if (!clipStoragePath || typeof clipStoragePath !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "clipStoragePath is required.");
    }

    const pathMatch = clipStoragePath.match(CLAIM_PATH_REGEX);
    if (!pathMatch) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "clipStoragePath must be claims/{bountyId}/{claimId}.mp4"
      );
    }

    const [, pathBountyId, claimId] = pathMatch;
    if (pathBountyId !== bountyId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "clipStoragePath bountyId does not match payload bountyId."
      );
    }

    if (filmerUid && filmerUid === uid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Filmer cannot be the claimer."
      );
    }

    const db = admin.firestore();
    const bountyRef = db.collection("bounties").doc(bountyId);
    const claimRef = bountyRef.collection("claims").doc(claimId);

    await db.runTransaction(async (transaction) => {
      const bountySnap = await transaction.get(bountyRef);
      if (!bountySnap.exists) {
        throw new functions.https.HttpsError("not-found", "Bounty not found.");
      }

      const bountyData = bountySnap.data() as {
        status?: string;
        expiresAt?: FirebaseFirestore.Timestamp;
        spotId?: string;
      };

      if (bountyData.status !== "OPEN") {
        throw new functions.https.HttpsError("failed-precondition", "Bounty is not open.");
      }

      const expiresAt = bountyData.expiresAt?.toDate();
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw new functions.https.HttpsError("failed-precondition", "Bounty has expired.");
      }

      const existingClaimSnap = await transaction.get(
        bountyRef.collection("claims").where("claimerUid", "==", uid).limit(1)
      );

      if (!existingClaimSnap.empty) {
        throw new functions.https.HttpsError("failed-precondition", "Claim already exists.");
      }

      const claimSnap = await transaction.get(claimRef);
      if (claimSnap.exists) {
        throw new functions.https.HttpsError("already-exists", "Claim already exists.");
      }

      const claimPayload = {
        bountyId,
        spotId: bountyData.spotId ?? null,
        claimerUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        clip: {
          storagePath: clipStoragePath,
          durationSeconds: durationSeconds ?? null,
        },
        filmer: filmerUid
          ? {
              uid: filmerUid,
              confirmed: false,
              confirmedAt: null,
            }
          : null,
        status: "PENDING",
        votes: {
          approveCount: 0,
          rejectCount: 0,
          weightedApprove: 0,
          weightedReject: 0,
          lastVoteAt: null,
        },
      };

      transaction.set(claimRef, claimPayload);
      transaction.update(bountyRef, {
        claimCount: admin.firestore.FieldValue.increment(1),
      });
    });

    return { claimId };
  }
);
