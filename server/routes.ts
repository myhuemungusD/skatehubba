import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertSpotSchema } from "@shared/schema";
import { publicWriteLimiter } from "./middleware/security";
import { requireCsrfToken } from "./middleware/csrf";

export async function registerRoutes(app: Express): Promise<Server> {
  // 1. Setup Authentication (Passport session)
  setupAuth(app);

  // 2. Spot Endpoints
  app.get("/api/spots", async (_req, res) => {
    const spots = await storage.getAllSpots();
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
    const spot = await storage.createSpot({
      ...result.data,
      createdBy: req.user.id,
    });

    res.status(201).json(spot);
  });

  // 3. Create HTTP Server
  const httpServer = createServer(app);
  return httpServer;
}
