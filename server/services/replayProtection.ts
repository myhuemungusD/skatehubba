import crypto from "node:crypto";
import { admin } from "../admin";

type ReplayCheckResult =
  | { ok: true }
  | { ok: false; reason: "invalid_timestamp" | "stale_timestamp" | "replay_detected" };

type ReplayCheckPayload = {
  spotId: number;
  lat: number;
  lng: number;
  nonce: string;
  clientTimestamp: string;
};

type ReplayStore = {
  checkAndStore: (record: ReplayStoreRecord) => Promise<"stored" | "replay">;
};

type ReplayStoreRecord = {
  userId: string;
  nonce: string;
  actionHash: string;
  spotId: number;
  lat: number;
  lng: number;
  clientTimestamp: string;
  expiresAtMs: number;
};

const NONCE_TTL_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;

const hashAction = (userId: string, payload: ReplayCheckPayload) => {
  const lat = payload.lat.toFixed(6);
  const lng = payload.lng.toFixed(6);
  const base = `${userId}:${payload.spotId}:${lat}:${lng}`;
  return crypto.createHash("sha256").update(base).digest("hex");
};

const createFirestoreReplayStore = (): ReplayStore => ({
  async checkAndStore(record) {
    const firestore = admin.firestore();
    const docId = `${record.userId}_${record.nonce}`;
    const docRef = firestore.collection("checkin_nonces").doc(docId);
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(record.expiresAtMs);

    const result = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);
      const data = snapshot.data();
      const existingExpiry = data?.expiresAt;
      const existingActionHash = data?.actionHash;

      if (snapshot.exists && existingExpiry instanceof admin.firestore.Timestamp) {
        if (existingExpiry.toMillis() > now.toMillis()) {
          // Nonce is still valid; ensure it is only ever used for the same action.
          if (typeof existingActionHash === "string" && existingActionHash !== record.actionHash) {
            // Nonce was previously bound to a different action, treat as replay attempt.
            return "replay" as const;
          }
          // Even if the action matches, reusing the nonce is a replay.
          return "replay" as const;
        }
      }

      transaction.set(
        docRef,
        {
          userId: record.userId,
          nonce: record.nonce,
          actionHash: record.actionHash,
          spotId: record.spotId,
          lat: record.lat,
          lng: record.lng,
          clientTimestamp: record.clientTimestamp,
          createdAt: now,
          expiresAt,
        },
        { merge: false }
      );

      return "stored" as const;
    });

    return result;
  },
});

export const createMemoryReplayStore = (): ReplayStore => {
  const store = new Map<string, ReplayStoreRecord>();

  return {
    async checkAndStore(record) {
      const key = `${record.userId}_${record.nonce}`;
      const existing = store.get(key);
      const now = Date.now();

      if (existing && existing.expiresAtMs > now) {
        return "replay";
      }

      store.set(key, record);
      return "stored";
    },
  };
};

export const verifyReplayProtection = async (
  userId: string,
  payload: ReplayCheckPayload,
  store: ReplayStore = createFirestoreReplayStore()
): Promise<ReplayCheckResult> => {
  const parsed = Date.parse(payload.clientTimestamp);
  if (Number.isNaN(parsed)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const now = Date.now();
  if (Math.abs(now - parsed) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const actionHash = hashAction(userId, payload);
  const expiresAtMs = now + NONCE_TTL_MS;
  const result = await store.checkAndStore({
    userId,
    nonce: payload.nonce,
    actionHash,
    spotId: payload.spotId,
    lat: payload.lat,
    lng: payload.lng,
    clientTimestamp: payload.clientTimestamp,
    expiresAtMs,
  });

  if (result === "replay") {
    return { ok: false, reason: "replay_detected" };
  }

  return { ok: true };
};
