import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { writeLedgerTx } from "../ledger/writeTx";

const MIN_REWARD = 500;
const DEFAULT_PLATFORM_FEE_BPS = 1000;
const DEFAULT_FILMER_CUT_BPS = 2000;
const DEFAULT_MIN_VOTES = 5;
const DEFAULT_APPROVE_RATIO = 0.6;
const DEFAULT_MAX_CLIP_SECONDS = 20;
const DEFAULT_ONE_TAKE = true;

interface CreateBountyPayload {
  spotId: string;
  trickDesc: string;
  rules?: string;
  rewardTotal: number;
  expiresAt: string;
}

interface UserBountyStats {
  monthlyBountyCount?: number;
  lastBountyAt?: FirebaseFirestore.Timestamp;
}

interface UserDoc {
  tier?: "SKATER" | "FILMER" | "PRO" | "SPONSOR" | "ADMIN";
  wallet?: {
    hubbaCredit?: number;
  };
  bountyStats?: UserBountyStats;
}

const isSameMonth = (a: Date, b: Date): boolean => {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
};

export const createBounty = functions.https.onCall(
  async (data: CreateBountyPayload, context: functions.https.CallableContext) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }

    const { spotId, trickDesc, rules, rewardTotal, expiresAt } = data;

    if (!spotId || typeof spotId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "spotId is required.");
    }

    if (!trickDesc || typeof trickDesc !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "trickDesc is required.");
    }

    if (!Number.isInteger(rewardTotal) || rewardTotal < MIN_REWARD) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `rewardTotal must be an integer >= ${MIN_REWARD}.`
      );
    }

    const expiresAtDate = new Date(expiresAt);
    if (Number.isNaN(expiresAtDate.getTime())) {
      throw new functions.https.HttpsError("invalid-argument", "expiresAt must be ISO string.");
    }

    const db = admin.firestore();
    const bountyRef = db.collection("bounties").doc();
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const userData = (userSnap.data() || {}) as UserDoc;

      const walletBalance = userData.wallet?.hubbaCredit ?? 0;
      if (walletBalance < rewardTotal) {
        transaction.set(userRef, { wallet: { hubbaCredit: walletBalance } }, { merge: true });
        throw new functions.https.HttpsError("failed-precondition", "Insufficient balance.");
      }

      const tier = userData.tier ?? "SKATER";
      const bountyStats = userData.bountyStats ?? {};
      const now = new Date();
      const lastBountyAt = bountyStats.lastBountyAt?.toDate();
      const isSameMonthAsLast = lastBountyAt ? isSameMonth(now, lastBountyAt) : false;
      const monthlyCount = isSameMonthAsLast ? (bountyStats.monthlyBountyCount ?? 0) : 0;

      if (tier === "SKATER" && monthlyCount >= 3) {
        throw new functions.https.HttpsError("resource-exhausted", "Monthly bounty limit reached.");
      }

      const nextMonthlyCount = monthlyCount + 1;

      transaction.set(
        userRef,
        {
          "wallet.hubbaCredit": walletBalance - rewardTotal,
          "bountyStats.lastBountyAt": admin.firestore.FieldValue.serverTimestamp(),
          "bountyStats.monthlyBountyCount": nextMonthlyCount,
          "bountyStats.bountiesPosted": admin.firestore.FieldValue.increment(1),
        },
        { merge: true }
      );

      transaction.set(bountyRef, {
        spotId,
        creatorUid: uid,
        trickDesc,
        rules: rules ?? null,
        requirements: {
          oneTake: DEFAULT_ONE_TAKE,
          mustShowSpot: true,
          maxClipSeconds: DEFAULT_MAX_CLIP_SECONDS,
        },
        rewardType: "CREDIT",
        rewardTotal,
        currency: "HUBBA_CREDIT",
        platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
        filmerCutBps: DEFAULT_FILMER_CUT_BPS,
        status: "OPEN",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
        claimCount: 0,
        voteCount: 0,
        verifyPolicy: {
          minVotes: DEFAULT_MIN_VOTES,
          approveRatio: DEFAULT_APPROVE_RATIO,
          proVoteWeight: 2,
        },
      });

      writeLedgerTx(
        {
          type: "BOUNTY_POST_HOLD",
          amount: -rewardTotal,
          currency: "HUBBA_CREDIT",
          fromUid: uid,
          bountyId: bountyRef.id,
          memo: "Bounty reward escrow hold",
        },
        { transaction }
      );
    });

    return { bountyId: bountyRef.id };
  }
);
