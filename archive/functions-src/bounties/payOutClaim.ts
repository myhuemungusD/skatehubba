import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { writeLedgerTx } from "../ledger/writeTx";

interface PayOutClaimPayload {
  bountyId: string;
  claimId: string;
}

interface ClaimDoc {
  claimerUid?: string;
  status?: string;
  filmer?: { uid?: string; confirmed?: boolean } | null;
  payout?: { paidAt?: FirebaseFirestore.Timestamp } | null;
}

interface BountyDoc {
  status?: string;
  rewardTotal?: number;
  platformFeeBps?: number;
  filmerCutBps?: number;
}

interface UserDoc {
  wallet?: { hubbaCredit?: number };
}

const getWalletBalance = (userData: UserDoc | undefined): number => {
  return userData?.wallet?.hubbaCredit ?? 0;
};

export const payOutClaim = functions.https.onCall(
  async (data: PayOutClaimPayload, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }

    const callerRoles = (context.auth.token.roles as string[]) || [];
    if (!callerRoles.includes("admin")) {
      throw new functions.https.HttpsError("permission-denied", "Admin role required.");
    }

    const { bountyId, claimId } = data;

    if (!bountyId || typeof bountyId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "bountyId is required.");
    }

    if (!claimId || typeof claimId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "claimId is required.");
    }

    const db = admin.firestore();
    const bountyRef = db.collection("bounties").doc(bountyId);
    const claimRef = bountyRef.collection("claims").doc(claimId);

    await db.runTransaction(async (transaction) => {
      const [bountySnap, claimSnap] = await Promise.all([
        transaction.get(bountyRef),
        transaction.get(claimRef),
      ]);

      if (!bountySnap.exists || !claimSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Bounty or claim not found.");
      }

      const bounty = bountySnap.data() as BountyDoc;
      const claim = claimSnap.data() as ClaimDoc;

      if (claim.status === "PAID" || claim.payout?.paidAt) {
        return;
      }

      if (claim.status !== "APPROVED") {
        throw new functions.https.HttpsError("failed-precondition", "Claim not approved.");
      }

      if (bounty.status !== "LOCKED") {
        throw new functions.https.HttpsError("failed-precondition", "Bounty not locked.");
      }

      const rewardTotal = bounty.rewardTotal ?? 0;
      if (!Number.isInteger(rewardTotal) || rewardTotal <= 0) {
        throw new functions.https.HttpsError("failed-precondition", "Invalid reward total.");
      }

      const platformFeeBps = bounty.platformFeeBps ?? 0;
      const filmerCutBps = bounty.filmerCutBps ?? 0;

      const platformFee = Math.floor((rewardTotal * platformFeeBps) / 10000);
      const netReward = rewardTotal - platformFee;
      const filmerConfirmed = claim.filmer?.confirmed ?? false;
      const filmerAmount = filmerConfirmed ? Math.floor((netReward * filmerCutBps) / 10000) : 0;
      const claimerAmount = netReward - filmerAmount;

      if (!claim.claimerUid) {
        throw new functions.https.HttpsError("failed-precondition", "Claim missing claimerUid.");
      }

      const claimerRef = db.collection("users").doc(claim.claimerUid);
      const filmerUid = claim.filmer?.uid;
      const filmerRef = filmerUid ? db.collection("users").doc(filmerUid) : null;

      const [claimerSnap, filmerSnap] = await Promise.all([
        transaction.get(claimerRef),
        filmerRef ? transaction.get(filmerRef) : Promise.resolve(null),
      ]);

      const claimerBalance = getWalletBalance(claimerSnap?.data() as UserDoc | undefined);
      const filmerBalance = getWalletBalance(filmerSnap?.data() as UserDoc | undefined);

      transaction.set(
        claimRef,
        {
          payout: {
            platformFee,
            netReward,
            claimerAmount,
            filmerAmount,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          status: "PAID",
        },
        { merge: true }
      );

      transaction.update(bountyRef, {
        status: "PAID",
      });

      transaction.set(
        claimerRef,
        {
          wallet: {
            hubbaCredit: claimerBalance + claimerAmount,
          },
        },
        { merge: true }
      );

      if (filmerRef && filmerUid && filmerConfirmed) {
        transaction.set(
          filmerRef,
          {
            wallet: {
              hubbaCredit: filmerBalance + filmerAmount,
            },
          },
          { merge: true }
        );
      }

      writeLedgerTx(
        {
          type: "PLATFORM_FEE",
          amount: platformFee,
          currency: "HUBBA_CREDIT",
          bountyId,
          claimId,
          memo: "Platform fee from bounty payout",
        },
        { transaction }
      );

      writeLedgerTx(
        {
          type: "CLAIM_PAYOUT",
          amount: claimerAmount,
          currency: "HUBBA_CREDIT",
          toUid: claim.claimerUid,
          bountyId,
          claimId,
          memo: "Claim payout to claimer",
        },
        { transaction }
      );

      if (filmerRef && filmerUid && filmerConfirmed && filmerAmount > 0) {
        writeLedgerTx(
          {
            type: "CLAIM_PAYOUT",
            amount: filmerAmount,
            currency: "HUBBA_CREDIT",
            toUid: filmerUid,
            bountyId,
            claimId,
            memo: "Claim payout to filmer",
          },
          { transaction }
        );
      }
    });

    return { success: true };
  }
);
