import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PresencePrivacy, PresenceStatus } from "@shared/validation/presence";
import { SpotLocationSchema } from "@shared/validation/spots";
import type { z } from "zod";

type SpotLocation = z.infer<typeof SpotLocationSchema>;

export interface PresenceUser {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  status: PresenceStatus;
  privacy: PresencePrivacy;
  location?: SpotLocation;
  spotId?: string;
  lastSeenAt: Date;
  updatedAt: Date;
}

const toDate = (value: unknown): Date => {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === "object" && "seconds" in value && "nanoseconds" in value) {
    const timestamp = value as { seconds: number; nanoseconds: number };
    return new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1_000_000));
  }
  return new Date();
};

export async function upsertPresence(payload: {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  status: PresenceStatus;
  privacy: PresencePrivacy;
  location?: SpotLocation;
  spotId?: string;
}): Promise<void> {
  if (!db) return;
  const ref = doc(db, "presence", payload.uid);
  await setDoc(
    ref,
    {
      uid: payload.uid,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl ?? null,
      status: payload.status,
      privacy: payload.privacy,
      location: payload.location ?? null,
      spotId: payload.spotId ?? null,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchNearbyPresence(params: {
  since: Date;
  maxResults: number;
  radiusMiles?: number;
  location?: SpotLocation | null;
}): Promise<PresenceUser[]> {
  if (!db) return [];
  const presenceQuery = query(
    collection(db, "presence"),
    where("privacy", "in", ["public", "approximate"]),
    where("lastSeenAt", ">=", Timestamp.fromDate(params.since)),
    orderBy("lastSeenAt", "desc"),
    limit(params.maxResults)
  );

  const snapshot = await getDocs(presenceQuery);
  const users = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      uid: String(data.uid ?? docSnap.id),
      displayName: String(data.displayName ?? "Skater"),
      avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : undefined,
      status: data.status as PresenceStatus,
      privacy: data.privacy as PresencePrivacy,
      location: data.location as SpotLocation | undefined,
      spotId: typeof data.spotId === "string" ? data.spotId : undefined,
      lastSeenAt: toDate(data.lastSeenAt),
      updatedAt: toDate(data.updatedAt),
    } satisfies PresenceUser;
  });

  if (!params.location || !params.radiusMiles) return users;

  const toRad = (value: number) => (value * Math.PI) / 180;
  const distanceMiles = (a: SpotLocation, b: SpotLocation) => {
    const earthRadiusMiles = 3958.8;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  return users.filter((user) => {
    if (!user.location) return false;
    return distanceMiles(params.location as SpotLocation, user.location) <= params.radiusMiles!;
  });
}

export async function fetchPresenceForSpot(params: {
  spotId: string;
  since: Date;
  maxResults: number;
}): Promise<PresenceUser[]> {
  if (!db) return [];
  const presenceQuery = query(
    collection(db, "presence"),
    where("spotId", "==", params.spotId),
    where("privacy", "in", ["public", "approximate"]),
    where("lastSeenAt", ">=", Timestamp.fromDate(params.since)),
    orderBy("lastSeenAt", "desc"),
    limit(params.maxResults)
  );

  const snapshot = await getDocs(presenceQuery);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      uid: String(data.uid ?? docSnap.id),
      displayName: String(data.displayName ?? "Skater"),
      avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : undefined,
      status: data.status as PresenceStatus,
      privacy: data.privacy as PresencePrivacy,
      location: data.location as SpotLocation | undefined,
      spotId: typeof data.spotId === "string" ? data.spotId : undefined,
      lastSeenAt: toDate(data.lastSeenAt),
      updatedAt: toDate(data.updatedAt),
    } satisfies PresenceUser;
  });
}
