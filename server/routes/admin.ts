import { Router } from "express";
import { authenticateUser, requireAdmin } from "../auth/middleware";
import { enforceAdminRateLimit } from "../middleware/trustSafety";
import { discoverSkateparks, isAreaCached } from "../services/osmDiscovery";
import { spotStorage } from "../storage";
import logger from "../logger";

export const adminRouter = Router();

/**
 * Admin-only endpoint to discover skateparks from OpenStreetMap.
 * This endpoint is protected with authentication, admin role check, and rate limiting
 * to prevent abuse and unauthorized database modifications.
 */
adminRouter.get(
  "/spots/discover",
  authenticateUser,
  requireAdmin,
  enforceAdminRateLimit(),
  async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ message: "Valid lat and lng query parameters are required" });
    }

    // Fast path: if we already discovered for this area, just return existing spots
    if (isAreaCached(lat, lng)) {
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
  }
);
