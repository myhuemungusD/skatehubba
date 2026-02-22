import { Router, type Request } from "express";
import { z } from "zod";
import { spotStorage } from "../storage/spots";
import { insertSpotSchema } from "@shared/schema";
import {
  checkInIpLimiter,
  perUserCheckInLimiter,
  perUserSpotWriteLimiter,
  publicWriteLimiter,
  spotRatingLimiter,
  spotDiscoveryLimiter,
} from "../middleware/security";
import { requireCsrfToken } from "../middleware/csrf";
import { authenticateUser, requireEmailVerification } from "../auth/middleware";
import { requirePaidOrPro } from "../middleware/requirePaidOrPro";
import { validateBody } from "../middleware/validation";
import { verifyAndCheckIn } from "../services/spotService";
import { discoverSkateparks, isAreaCached } from "../services/osmDiscovery";
import { logAuditEvent } from "../services/auditLog";
import { verifyReplayProtection } from "../services/replayProtection";
import { SpotCheckInSchema, type SpotCheckInRequest } from "@shared/validation/spotCheckIn";
import { getClientIp } from "../utils/ip";
import logger from "../logger";

const router = Router();

// GET /api/spots — list all spots
router.get("/", async (_req, res) => {
  try {
    const spots = await spotStorage.getAllSpots();
    res.json(spots);
  } catch (error) {
    logger.error("Failed to fetch spots", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.json([]);
  }
});

// GET /api/spots/discover — discover skateparks near user's location from OpenStreetMap
router.get("/discover", spotDiscoveryLimiter, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ message: "Valid lat and lng query parameters are required" });
  }

  // Fast path: if we already discovered for this area, just return existing spots
  if (await isAreaCached(lat, lng)) {
    const allSpots = await spotStorage.getAllSpots();
    return res.json({ discovered: 0, added: 0, cached: true, spots: allSpots });
  }

  try {
    const discovered = await discoverSkateparks(lat, lng);
    let added = 0;

    for (const spot of discovered) {
      // Skip if a spot with the same name already exists nearby
      const isDuplicate = await spotStorage.checkDuplicate(spot.name, spot.lat, spot.lng);
      if (isDuplicate) continue;

      const created = await spotStorage.createSpot({
        name: spot.name,
        description: spot.description,
        spotType: spot.spotType,
        lat: spot.lat,
        lng: spot.lng,
        address: spot.address || undefined,
        city: spot.city || undefined,
        state: spot.state || undefined,
        country: spot.country || "USA",
        createdBy: "system",
      });
      // Mark OSM-sourced spots as verified since they're real confirmed places
      await spotStorage.verifySpot(created.id);
      added++;
    }

    // Return all spots (including newly added ones)
    const allSpots = await spotStorage.getAllSpots();
    return res.json({ discovered: discovered.length, added, spots: allSpots });
  } catch (error) {
    logger.error("Spot discovery failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Still return existing spots even if discovery failed
    const allSpots = await spotStorage.getAllSpots();
    return res.json({ discovered: 0, added: 0, spots: allSpots });
  }
});

// GET /api/spots/:spotId — get a single spot
router.get("/:spotId", async (req, res) => {
  const spotId = Number(req.params.spotId);
  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Invalid spot ID" });
  }

  try {
    const spot = await spotStorage.getSpotById(spotId);
    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }
    return res.json(spot);
  } catch (error) {
    logger.error("Failed to fetch spot", {
      spotId,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ message: "Failed to load spot" });
  }
});

const spotRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

// POST /api/spots/:spotId/rate — rate a spot
router.post(
  "/:spotId/rate",
  authenticateUser,
  requirePaidOrPro,
  spotRatingLimiter,
  validateBody(spotRatingSchema),
  async (req, res) => {
    const spotId = Number(req.params.spotId);
    if (Number.isNaN(spotId)) {
      return res.status(400).json({ message: "Invalid spot ID" });
    }

    const { rating } = (req as Request & { validatedBody: { rating: number } }).validatedBody;
    const userId = req.currentUser!.id;

    await spotStorage.updateRating(spotId, rating, userId);
    const updated = await spotStorage.getSpotById(spotId);

    if (!updated) {
      return res.status(404).json({ message: "Spot not found" });
    }

    return res.status(200).json(updated);
  }
);

// POST /api/spots — create a new spot
router.post(
  "/",
  authenticateUser,
  requirePaidOrPro,
  requireEmailVerification,
  publicWriteLimiter,
  perUserSpotWriteLimiter,
  requireCsrfToken,
  validateBody(insertSpotSchema),
  async (req, res) => {
    type InsertSpot = z.infer<typeof insertSpotSchema>;
    const spotPayload = req.body as InsertSpot;

    // Check for duplicate spots (same name + similar coords)
    const isDuplicate = await spotStorage.checkDuplicate(
      spotPayload.name,
      spotPayload.lat,
      spotPayload.lng
    );

    if (isDuplicate) {
      logAuditEvent({
        action: "spot.rejected.duplicate",
        userId: req.currentUser!.id,
        ip: getClientIp(req),
        metadata: {
          name: spotPayload.name,
          lat: spotPayload.lat,
          lng: spotPayload.lng,
        },
      });
      return res.status(409).json({
        error: "A spot with this name already exists at this location.",
      });
    }

    // Creation: Pass 'createdBy' from the authenticated session
    const spot = await spotStorage.createSpot({
      ...spotPayload,
      createdBy: req.currentUser!.id,
    });

    logAuditEvent({
      action: "spot.created",
      userId: req.currentUser!.id,
      ip: getClientIp(req),
      metadata: {
        spotId: spot.id,
        lat: spot.lat,
        lng: spot.lng,
      },
    });

    return res.status(201).json(spot);
  }
);

// POST /api/spots/check-in — check in at a spot
router.post(
  "/check-in",
  authenticateUser,
  requirePaidOrPro,
  checkInIpLimiter,
  perUserCheckInLimiter,
  validateBody(SpotCheckInSchema),
  async (req, res) => {
    const parsedBody = req.body as SpotCheckInRequest;

    const userId = req.currentUser?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { spotId, lat, lng, accuracy, nonce, clientTimestamp } = parsedBody;

    const replayCheck = await verifyReplayProtection(userId, {
      spotId,
      lat,
      lng,
      nonce,
      clientTimestamp,
    });
    if (!replayCheck.ok) {
      const status = replayCheck.reason === "replay_detected" ? 409 : 400;
      const message =
        replayCheck.reason === "replay_detected" ? "Replay detected" : "Invalid check-in timestamp";
      logAuditEvent({
        action: "spot.checkin.rejected",
        userId,
        ip: getClientIp(req),
        metadata: {
          spotId,
          reason: replayCheck.reason,
        },
      });
      return res.status(status).json({ message });
    }

    try {
      const result = await verifyAndCheckIn(userId, spotId, lat, lng, accuracy);
      if (!result.success) {
        logAuditEvent({
          action: "spot.checkin.denied",
          userId,
          ip: getClientIp(req),
          metadata: {
            spotId,
            reason: result.message,
          },
        });
        return res.status(422).json({
          message: result.message,
          code: result.code,
          distance: result.distance,
          radius: result.radius,
        });
      }

      logAuditEvent({
        action: "spot.checkin.approved",
        userId,
        ip: getClientIp(req),
        metadata: {
          spotId,
          checkInId: result.checkInId,
        },
      });

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "Spot not found") {
        return res.status(404).json({ message: "Spot not found" });
      }

      return res.status(500).json({ message: "Check-in failed" });
    }
  }
);

export const spotsRouter = router;
