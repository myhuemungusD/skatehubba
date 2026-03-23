/**
 * Spots routes — CRUD for skate spots on the map.
 * Simplified for MVP: no replay protection, no circuit breaker, no OSM discovery.
 */

import { Router } from "express";
import { getDb } from "../db";
import { spots, spotRatings, checkIns, insertSpotSchema, rateSpotSchema } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import { authenticateUser, optionalAuthentication } from "../auth/middleware";
import { Errors } from "../utils/apiError";
import logger from "../logger";

const router = Router();

// GET /api/spots — List all active spots
router.get("/", optionalAuthentication, async (_req, res) => {
  try {
    const db = getDb();
    const allSpots = await db
      .select()
      .from(spots)
      .where(eq(spots.isActive, true))
      .orderBy(desc(spots.createdAt));

    res.json({ spots: allSpots });
  } catch (error) {
    logger.error("[Spots] Failed to fetch spots", { error });
    return Errors.internal(res, "FETCH_FAILED", "Failed to fetch spots.");
  }
});

// GET /api/spots/:id — Single spot detail
router.get("/:id", optionalAuthentication, async (req, res) => {
  const spotId = parseInt(req.params.id, 10);
  if (isNaN(spotId)) return Errors.badRequest(res, "INVALID_ID", "Invalid spot ID.");

  try {
    const db = getDb();
    const [spot] = await db.select().from(spots).where(eq(spots.id, spotId)).limit(1);
    if (!spot) return Errors.notFound(res, "SPOT_NOT_FOUND", "Spot not found.");
    res.json({ spot });
  } catch (error) {
    logger.error("[Spots] Failed to fetch spot", { error, spotId });
    return Errors.internal(res, "FETCH_FAILED", "Failed to fetch spot.");
  }
});

// POST /api/spots — Create a new spot (authenticated)
router.post("/", authenticateUser, async (req, res) => {
  const parsed = insertSpotSchema.safeParse(req.body);
  if (!parsed.success) return Errors.validation(res, parsed.error.flatten());

  const currentUserId = req.currentUser!.id;

  try {
    const db = getDb();
    const [spot] = await db
      .insert(spots)
      .values({ ...parsed.data, createdBy: currentUserId })
      .returning();

    logger.info("[Spots] Spot created", { spotId: spot.id, userId: currentUserId });
    res.status(201).json({ spot });
  } catch (error) {
    logger.error("[Spots] Failed to create spot", { error, userId: currentUserId });
    return Errors.internal(res, "CREATE_FAILED", "Failed to create spot.");
  }
});

// POST /api/spots/:id/rate — Rate a spot (1-5)
router.post("/:id/rate", authenticateUser, async (req, res) => {
  const spotId = parseInt(req.params.id, 10);
  if (isNaN(spotId)) return Errors.badRequest(res, "INVALID_ID", "Invalid spot ID.");

  const parsed = rateSpotSchema.safeParse(req.body);
  if (!parsed.success) return Errors.validation(res, parsed.error.flatten());
  const { rating } = parsed.data;

  const currentUserId = req.currentUser!.id;

  try {
    const db = getDb();

    // Upsert rating
    await db
      .insert(spotRatings)
      .values({ spotId, userId: currentUserId, rating })
      .onConflictDoUpdate({
        target: [spotRatings.spotId, spotRatings.userId],
        set: { rating, updatedAt: new Date() },
      });

    // Recalculate average
    const [avg] = await db
      .select({
        avgRating: sql<number>`avg(${spotRatings.rating})::double precision`,
        count: sql<number>`count(*)::int`,
      })
      .from(spotRatings)
      .where(eq(spotRatings.spotId, spotId));

    await db
      .update(spots)
      .set({ rating: avg.avgRating || 0, ratingCount: avg.count || 0, updatedAt: new Date() })
      .where(eq(spots.id, spotId));

    res.json({ rating: avg.avgRating, ratingCount: avg.count });
  } catch (error) {
    logger.error("[Spots] Failed to rate spot", { error, spotId, userId: currentUserId });
    return Errors.internal(res, "RATE_FAILED", "Failed to rate spot.");
  }
});

// POST /api/spots/:id/check-in — Check in at a spot
router.post("/:id/check-in", authenticateUser, async (req, res) => {
  const spotId = parseInt(req.params.id, 10);
  if (isNaN(spotId)) return Errors.badRequest(res, "INVALID_ID", "Invalid spot ID.");

  const currentUserId = req.currentUser!.id;

  try {
    const db = getDb();

    const [spot] = await db.select().from(spots).where(eq(spots.id, spotId)).limit(1);
    if (!spot) return Errors.notFound(res, "SPOT_NOT_FOUND", "Spot not found.");

    const [checkIn] = await db
      .insert(checkIns)
      .values({ userId: currentUserId, spotId })
      .returning();

    // Increment check-in count
    await db
      .update(spots)
      .set({ checkInCount: sql`${spots.checkInCount} + 1`, updatedAt: new Date() })
      .where(eq(spots.id, spotId));

    res.status(201).json({ checkIn });
  } catch (error) {
    logger.error("[Spots] Failed to check in", { error, spotId, userId: currentUserId });
    return Errors.internal(res, "CHECKIN_FAILED", "Failed to check in.");
  }
});

export { router as spotsRouter };
