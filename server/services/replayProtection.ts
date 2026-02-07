import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { checkinNonces } from "@shared/schema";

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

const createPostgresReplayStore = (): ReplayStore => ({
  async checkAndStore(record) {
    const db = getDb();
    const docId = `${record.userId}_${record.nonce}`;
    const now = new Date();
    const expiresAt = new Date(record.expiresAtMs);

    // Use a transaction with SELECT FOR UPDATE to prevent race conditions
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(checkinNonces)
        .where(eq(checkinNonces.id, docId))
        .for("update");

      if (existing) {
        // Nonce exists and hasn't expired
        if (existing.expiresAt > now) {
          return "replay" as const;
        }
        // Nonce expired — overwrite with new data
        await tx
          .update(checkinNonces)
          .set({
            actionHash: record.actionHash,
            spotId: record.spotId,
            lat: record.lat,
            lng: record.lng,
            clientTimestamp: record.clientTimestamp,
            expiresAt,
            createdAt: now,
          })
          .where(eq(checkinNonces.id, docId));
        return "stored" as const;
      }

      await tx.insert(checkinNonces).values({
        id: docId,
        userId: record.userId,
        nonce: record.nonce,
        actionHash: record.actionHash,
        spotId: record.spotId,
        lat: record.lat,
        lng: record.lng,
        clientTimestamp: record.clientTimestamp,
        expiresAt,
        createdAt: now,
      });

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
  store: ReplayStore = createPostgresReplayStore()
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
