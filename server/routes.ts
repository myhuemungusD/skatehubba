import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuthRoutes } from "./auth/routes";
import { spotStorage } from "./storage/spots";
import { getDb, isDatabaseAvailable } from "./db";
import { customUsers, userProfiles, spots, games } from "@shared/schema";
import { ilike, or, eq, count } from "drizzle-orm";
import { insertSpotSchema } from "@shared/schema";
import { publicWriteLimiter } from "./middleware/security";
import { requireCsrfToken } from "./middleware/csrf";
import { z } from "zod";
import { authenticateUser } from "./auth/middleware";
import { verifyAndCheckIn } from "./services/spotService";
import { analyticsRouter } from "./routes/analytics";
import { metricsRouter } from "./routes/metrics";

export async function registerRoutes(app: Express): Promise<Server> {
  // 1. Setup Authentication (Passport session)
  setupAuthRoutes(app);

  // 2. Analytics Routes (Firebase UID auth, idempotent)
  app.use("/api/analytics", analyticsRouter);

  // 3. Metrics Routes (Admin only, for dashboard)
  app.use("/api/metrics", metricsRouter);

  // 4. Spot Endpoints
  app.get("/api/spots", async (_req, res) => {
    const spots = await spotStorage.getAllSpots();
    res.json(spots);
  });

  app.post("/api/spots", publicWriteLimiter, requireCsrfToken, async (req, res) => {
    // Basic Auth Check: Ensure we have a user ID to bind the spot to
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "You must be logged in to create a spot" });
    }

    // Validation: Zod Parse
    const result = insertSpotSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json(result.error);
    }

    // Creation: Pass 'createdBy' from the authenticated session
    const spot = await spotStorage.createSpot({
      ...result.data,
      createdBy: req.currentUser?.id || "",
    });

    res.status(201).json(spot);
  });

  const checkInSchema = z.object({
    spotId: z.number().int(),
    lat: z.number(),
    lng: z.number(),
  });

  app.post("/api/spots/check-in", authenticateUser, async (req, res) => {
    const parsed = checkInSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", issues: parsed.error.flatten() });
    }

    const userId = req.currentUser?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { spotId, lat, lng } = parsed.data;

    try {
      const result = await verifyAndCheckIn(userId, spotId, lat, lng);
      if (!result.success) {
        return res.status(403).json({ message: result.message });
      }

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "Spot not found") {
        return res.status(404).json({ message: "Spot not found" });
      }

      return res.status(500).json({ message: "Check-in failed" });
    }
  });

  // 3. Public Stats Endpoint (for landing page)
  app.get("/api/stats", async (_req, res) => {
    try {
      if (!isDatabaseAvailable()) {
        return res.json({ totalUsers: 0, totalSpots: 0, totalBattles: 0 });
      }
      const database = getDb();
      const [usersResult, spotsResult, gamesResult] = await Promise.all([
        database.select({ count: count() }).from(customUsers),
        database.select({ count: count() }).from(spots),
        database.select({ count: count() }).from(games),
      ]);

      res.json({
        totalUsers: usersResult[0]?.count || 0,
        totalSpots: spotsResult[0]?.count || 0,
        totalBattles: gamesResult[0]?.count || 0,
      });
    } catch {
      // Return null stats on error - frontend handles gracefully
      res.json({ totalUsers: 0, totalSpots: 0, totalBattles: 0 });
    }
  });

  // 4. Create HTTP Server
  const httpServer = createServer(app);
  return httpServer;
}
