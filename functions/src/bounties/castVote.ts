import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

interface CastVotePayload {
  bountyId: string;
  claimId: string;
  vote: "APPROVE" | "REJECT";
  comment?: string;
}

interface UserDoc {
  bountyStats?: {
    reputation?: number;
  };
}

export const castVote = functions.https.onCall(
  async (data: CastVotePayload, context: functions.https.CallableContext) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }

    const { bountyId, claimId, vote, comment } = data;

    if (!bountyId || typeof bountyId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "bountyId is required.");
    }

    if (!claimId || typeof claimId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "claimId is required.");
    }

    if (vote !== "APPROVE" && vote !== "REJECT") {
      throw new functions.https.HttpsError("invalid-argument", "vote must be APPROVE or REJECT.");
    }

    const db = admin.firestore();
    const bountyRef = db.collection("bounties").doc(bountyId);
    const claimRef = bountyRef.collection("claims").doc(claimId);
    const voteRef = claimRef.collection("votes").doc(uid);
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (transaction) => {
      const [bountySnap, claimSnap, voteSnap, userSnap] = await Promise.all([
        transaction.get(bountyRef),
        transaction.get(claimRef),
        transaction.get(voteRef),
        transaction.get(userRef),
      ]);

      if (!bountySnap.exists || !claimSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Bounty or claim not found.");
      }

      const bountyData = bountySnap.data() as {
        status?: string;
        verifyPolicy?: { minVotes?: number; approveRatio?: number };
      };

      const claimData = claimSnap.data() as {
        claimerUid?: string;
        status?: string;
        votes?: {
          approveCount?: number;
          rejectCount?: number;
          weightedApprove?: number;
          weightedReject?: number;
        };
      };

      if (claimData.claimerUid === uid) {
        throw new functions.https.HttpsError("failed-precondition", "Cannot vote on your own claim.");
      }

      if (claimData.status !== "PENDING") {
        throw new functions.https.HttpsError("failed-precondition", "Claim is not pending.");
      }

      if (bountyData.status !== "OPEN") {
        throw new functions.https.HttpsError("failed-precondition", "Bounty is not open.");
      }

      const userData = (userSnap.data() || {}) as UserDoc;
      const reputation = userData.bountyStats?.reputation ?? 0;
      if (reputation < 30) {
        throw new functions.https.HttpsError("failed-precondition", "Reputation too low to vote.");
      }

      const previousVote = voteSnap.exists
        ? (voteSnap.data() as { vote?: "APPROVE" | "REJECT" })
        : null;

      let approveCount = claimData.votes?.approveCount ?? 0;
      let rejectCount = claimData.votes?.rejectCount ?? 0;
      let weightedApprove = claimData.votes?.weightedApprove ?? 0;
      let weightedReject = claimData.votes?.weightedReject ?? 0;

      if (previousVote?.vote === "APPROVE") {
        approveCount -= 1;
        weightedApprove -= 1;
      }

      if (previousVote?.vote === "REJECT") {
        rejectCount -= 1;
        weightedReject -= 1;
      }

      if (vote === "APPROVE") {
        approveCount += 1;
        weightedApprove += 1;
      }

      if (vote === "REJECT") {
        rejectCount += 1;
        weightedReject += 1;
      }

      const wasNewVote = !previousVote;

      transaction.set(voteRef, {
        voterUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        vote,
        weight: 1,
        comment: comment ?? null,
      });

      transaction.update(claimRef, {
        "votes.approveCount": approveCount,
        "votes.rejectCount": rejectCount,
        "votes.weightedApprove": weightedApprove,
        "votes.weightedReject": weightedReject,
        "votes.lastVoteAt": admin.firestore.FieldValue.serverTimestamp(),
      });

      if (wasNewVote) {
        transaction.update(bountyRef, {
          voteCount: admin.firestore.FieldValue.increment(1),
        });
      }

      const totalVotes = approveCount + rejectCount;
      const minVotes = bountyData.verifyPolicy?.minVotes ?? 5;
      const approveRatio = bountyData.verifyPolicy?.approveRatio ?? 0.6;
      const approvalRate = totalVotes === 0 ? 0 : approveCount / totalVotes;

      if (totalVotes < minVotes || approvalRate < approveRatio) {
        return;
      }

      transaction.update(claimRef, {
        status: "APPROVED",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        decisionBy: {
          uid: "auto",
          role: "AUTO",
        },
      });

      transaction.update(bountyRef, {
        status: "LOCKED",
        lockedAt: admin.firestore.FieldValue.serverTimestamp(),
        lockedReason: "Claim approved",
      });
    });

    return { success: true };
  }
);
