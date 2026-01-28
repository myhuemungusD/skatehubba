import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { writeLedgerTx } from "../ledger/writeTx";

interface BountyDoc {
  creatorUid?: string;
  rewardTotal?: number;
  status?: string;
  expiresAt?: FirebaseFirestore.Timestamp;
}

interface UserDoc {
  wallet?: { hubbaCredit?: number };
}

const REFUND_RATE = 0.8;

export const expireBounties = functions.pubsub
  .schedule("every 60 minutes")
  .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.fromDate(new Date());

    const snapshot = await db
      .collection("bounties")
      .where("status", "==", "OPEN")
      .where("expiresAt", "<=", now)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const tasks = snapshot.docs.map((doc) => {
      const bountyRef = doc.ref;
      return db.runTransaction(async (transaction) => {
        const bountySnap = await transaction.get(bountyRef);
        if (!bountySnap.exists) {
          return;
        }

        const bounty = bountySnap.data() as BountyDoc;
        if (bounty.status !== "OPEN") {
          return;
        }

        const rewardTotal = bounty.rewardTotal ?? 0;
        const refundAmount = Math.floor(rewardTotal * REFUND_RATE);

        if (!bounty.creatorUid) {
          transaction.update(bountyRef, {
            status: "EXPIRED",
            lockedReason: "Expired",
            lockedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return;
        }

        const userRef = db.collection("users").doc(bounty.creatorUid);
        const userSnap = await transaction.get(userRef);
        const userData = (userSnap.data() || {}) as UserDoc;
        const walletBalance = userData.wallet?.hubbaCredit ?? 0;

        transaction.set(
          userRef,
          {
            wallet: {
              hubbaCredit: walletBalance + refundAmount,
            },
          },
          { merge: true }
        );

        transaction.update(bountyRef, {
          status: "EXPIRED",
          lockedReason: "Expired",
          lockedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        writeLedgerTx(
          {
            type: "BOUNTY_REFUND",
            amount: refundAmount,
            currency: "HUBBA_CREDIT",
            toUid: bounty.creatorUid,
            bountyId: bountyRef.id,
            memo: "Bounty refund on expiry (80%)",
          },
          { transaction }
        );
      });
    });

    await Promise.all(tasks);

    return null;
  });
