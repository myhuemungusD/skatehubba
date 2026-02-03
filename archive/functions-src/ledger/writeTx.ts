import * as admin from "firebase-admin";

export type LedgerTxType = "BOUNTY_POST_HOLD" | "BOUNTY_REFUND" | "CLAIM_PAYOUT" | "PLATFORM_FEE";

export interface LedgerTxInput {
  type: LedgerTxType;
  amount: number;
  currency: "HUBBA_CREDIT";
  fromUid?: string;
  toUid?: string;
  bountyId?: string;
  claimId?: string;
  memo?: string;
}

export interface LedgerWriteOptions {
  transaction?: FirebaseFirestore.Transaction;
  txId?: string;
}

export function writeLedgerTx(
  input: LedgerTxInput,
  options: LedgerWriteOptions = {}
): FirebaseFirestore.DocumentReference {
  const db = admin.firestore();
  const txRef = options.txId
    ? db.collection("ledger").doc(options.txId)
    : db.collection("ledger").doc();

  const payload = {
    ...input,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (options.transaction) {
    options.transaction.set(txRef, payload);
    return txRef;
  }

  void txRef.set(payload);
  return txRef;
}
