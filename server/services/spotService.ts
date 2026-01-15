import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "../db";
import { checkIns, spots } from "@shared/schema";

const EARTH_RADIUS_KM = 6371;
// Default check-in radius in meters. 30m is chosen as a balance between typical GPS accuracy
// on mobile devices and preventing check-ins that are too far from the actual spot.
const DEFAULT_CHECK_IN_RADIUS_METERS = 30;

// Allow overriding the check-in radius via an environment variable for different deployments
// (e.g., urban vs rural, testing vs production). If not set or invalid, fall back to the default.
const CHECK_IN_RADIUS_METERS = (() => {
  const envValue = process.env.CHECK_IN_RADIUS_METERS;
  if (!envValue) return DEFAULT_CHECK_IN_RADIUS_METERS;
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHECK_IN_RADIUS_METERS;
})();
type CheckInSuccess = {
  success: true;
  checkInId: number;
};

type CheckInFailure = {
  success: false;
  message: string;
};

type CheckInResult = CheckInSuccess | CheckInFailure;

type PgError = { code?: string };

const isPgError = (error: unknown): error is PgError => {
  return typeof error === "object" && error !== null && "code" in error;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const originLat = toRadians(lat1);
  const destLat = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(originLat) * Math.cos(destLat) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c * 1000;
};

export async function getNearbySpots(lat: number, lng: number, radiusKm: number) {
  if (!db) {
    return [];
  }

  const distanceKm = sql<number>`(
    ${EARTH_RADIUS_KM} * acos(
      greatest(-1, least(1,
        sin(radians(${lat})) * sin(radians(${spots.lat})) +
        cos(radians(${lat})) * cos(radians(${spots.lat})) *
        cos(radians(${spots.lng}) - radians(${lng}))
      ))
    )
  )`;

  const rows = await db
    .select({
      ...getTableColumns(spots),
      distanceKm,
    })
    .from(spots)
    .where(and(eq(spots.isActive, true), sql`${distanceKm} <= ${radiusKm}`))
    .orderBy(distanceKm);

  return rows;
}

export async function verifyAndCheckIn(
  userId: string,
  spotId: number,
  userLat: number,
  userLng: number,
): Promise<CheckInResult> {
  if (!db) {
    throw new Error("Database not available");
  }

  const [spot] = await db
    .select({
      ...getTableColumns(spots),
    })
    .from(spots)
    .where(eq(spots.id, spotId))
    .limit(1);

  if (!spot) {
    throw new Error("Spot not found");
  }

  const distanceMeters = haversineMeters(userLat, userLng, spot.lat, spot.lng);
  if (distanceMeters > CHECK_IN_RADIUS_METERS) {
    return { success: false, message: "Too far from spot" };
  }

  try {
    const checkIn = await db.transaction(async (tx: typeof db) => {
      const [createdCheckIn] = await tx
        .insert(checkIns)
        .values({
          userId,
          spotId,
          timestamp: new Date(),
        })
        .returning({ id: checkIns.id });

      await tx
        .update(spots)
        .set({
          checkInCount: sql`${spots.checkInCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(spots.id, spotId));

      return createdCheckIn;
    });
    return { success: true, checkInId: checkIn.id };
  } catch (error) {
    if (isPgError(error) && error.code === "23505") {
      return { success: false, message: "Already checked in today" };
    }

    throw error;
  }
}
