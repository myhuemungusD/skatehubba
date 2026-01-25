import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  SpotDocumentSchema,
  type SpotDocument,
  SpotDifficultySchema,
  SpotStatusSchema,
  SpotVisibilitySchema,
} from "@shared/validation/spots";
import type { z } from "zod";

export type SpotDifficulty = z.infer<typeof SpotDifficultySchema>;
export type SpotStatus = z.infer<typeof SpotStatusSchema>;
export type SpotVisibility = z.infer<typeof SpotVisibilitySchema>;

export interface SpotRecord extends SpotDocument {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: unknown): Date => {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === "object" && "seconds" in value && "nanoseconds" in value) {
    const ts = value as { seconds: number; nanoseconds: number };
    return new Date(ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1_000_000));
  }
  return new Date();
};

const normalizeSpot = (docSnap: QueryDocumentSnapshot<DocumentData>): SpotRecord => {
  const parsed = SpotDocumentSchema.parse(docSnap.data());
  return {
    ...parsed,
    id: docSnap.id,
    createdAt: toDate(parsed.createdAt),
    updatedAt: toDate(parsed.updatedAt),
  };
};

interface SpotFetchParams {
  pageSize: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  sort: "closest" | "trending" | "newest";
  status?: SpotStatus;
  visibility?: SpotVisibility;
}

export async function fetchSpotsPage({
  pageSize,
  cursor,
  sort,
  status = "active",
  visibility = "public",
}: SpotFetchParams) {
  if (!db) return { spots: [], cursor: null };

  const baseFilters = [
    where("status", "==", status),
    where("visibility", "==", visibility),
  ];

  const order =
    sort === "trending"
      ? orderBy("stats.checkins30d", "desc")
      : orderBy("createdAt", "desc");

  const spotQuery = query(
    collection(db, "spots"),
    ...baseFilters,
    order,
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize)
  );

  const snapshot = await getDocs(spotQuery);
  const spots = snapshot.docs.map((docSnap) => normalizeSpot(docSnap));
  const nextCursor = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

  return { spots, cursor: nextCursor };
}

interface SpotNearbyParams {
  location?: { lat: number; lng: number } | null;
  radiusMiles: number;
  maxResults: number;
}

export async function fetchNearbySpots({
  location,
  radiusMiles,
  maxResults,
}: SpotNearbyParams): Promise<SpotRecord[]> {
  if (!db) return [];
  const baseFilters = [where("status", "==", "active"), where("visibility", "==", "public")];
  const spotQuery = query(
    collection(db, "spots"),
    ...baseFilters,
    orderBy("createdAt", "desc"),
    limit(maxResults)
  );
  const snapshot = await getDocs(spotQuery);
  const spots = snapshot.docs.map((docSnap) => normalizeSpot(docSnap));
  if (!location) return spots;

  const toRad = (value: number) => (value * Math.PI) / 180;
  const distanceMiles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
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

  return spots.filter((spot) => distanceMiles(location, spot.location) <= radiusMiles);
}

export async function fetchSpotById(spotId: string): Promise<SpotRecord | null> {
  if (!db) return null;
  const ref = doc(db, "spots", spotId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return normalizeSpot(snapshot);
}
