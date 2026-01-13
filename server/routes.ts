import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuthRoutes } from "./auth/routes";
import { authenticateUser } from "./auth/middleware";
import { spotStorage } from "./storage/spots";
import { insertSpotSchema } from "@shared/schema";
import { publicWriteLimiter } from "./middleware/security";
import logger from "./logger";

// Note: CSRF protection is applied globally in index.ts via requireCsrfToken middleware

export async function registerRoutes(app: Express): Promise<Server> {
  // 1. Setup Authentication (Passport session)
  setupAuthRoutes(app);

  // 2. Spot Endpoints
  // IMPORTANT: Specific routes MUST come before parameterized routes

  // GET /api/spots/stats - Get spot statistics (specific route first)
  app.get("/api/spots/stats", async (_req, res) => {
    try {
      const stats = await spotStorage.getStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to fetch spot stats', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: 'Failed to fetch stats' });
    }
  });

  // GET /api/spots/user/me - Get current user's spots (specific route first)
  app.get("/api/spots/user/me", authenticateUser, async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "You must be logged in" });
      }

      const spots = await spotStorage.getSpotsByUser(req.currentUser.id);
      res.json(spots);
    } catch (error) {
      logger.error('Failed to fetch user spots', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: 'Failed to fetch your spots' });
    }
  });

  // GET /api/spots - Get all spots (with optional filters)
  app.get("/api/spots", async (req, res) => {
    try {
      const { city, spotType, tier, lat, lng, radius, limit } = req.query;

      // If lat/lng provided, search nearby
      if (lat && lng) {
        const spots = await spotStorage.getSpotsNearLocation(
          parseFloat(lat as string),
          parseFloat(lng as string),
          radius ? parseFloat(radius as string) : 50,
          limit ? parseInt(limit as string) : 100
        );
        return res.json(spots);
      }

      // Otherwise, get all with filters
      const spots = await spotStorage.getAllSpots({
        city: city as string,
        spotType: spotType as string,
        tier: tier as string,
        limit: limit ? parseInt(limit as string) : undefined,
      });
      res.json(spots);
    } catch (error) {
      logger.error('Failed to fetch spots', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: 'Failed to fetch spots' });
    }
  });

  // GET /api/spots/:id - Get a single spot (parameterized route AFTER specific routes)
  app.get("/api/spots/:id", async (req, res) => {
    try {
      const spotId = parseInt(req.params.id);
      if (isNaN(spotId)) {
        return res.status(400).json({ message: "Invalid spot ID" });
      }

      const spot = await spotStorage.getSpotById(spotId);
      if (!spot) {
        return res.status(404).json({ message: "Spot not found" });
      }

      res.json(spot);
    } catch (error) {
      logger.error('Failed to fetch spot', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: 'Failed to fetch spot' });
    }
  });

  // POST /api/spots - Create a new spot
  app.post("/api/spots", authenticateUser, publicWriteLimiter, async (req, res) => {
    try {
      // Basic Auth Check: Ensure we have a user ID to bind the spot to
      if (!req.currentUser) {
        return res.status(401).json({ message: "You must be logged in to create a spot" });
      }

      // Validation: Zod Parse
      const result = insertSpotSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: result.error.flatten().fieldErrors 
        });
      }

      // Creation: Pass 'createdBy' from the authenticated session
      const spot = await spotStorage.createSpot({
        ...result.data,
        createdBy: req.currentUser.id,
      });

      res.status(201).json(spot);
    } catch (error) {
      logger.error('Failed to create spot', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: 'Failed to create spot' });
    }
  });

  // PUT /api/spots/:id - Update a spot
  app.put("/api/spots/:id", authenticateUser, publicWriteLimiter, async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "You must be logged in to update a spot" });
      }

      const spotId = parseInt(req.params.id);
      if (isNaN(spotId)) {
        return res.status(400).json({ message: "Invalid spot ID" });
      }

      // Check ownership
      const existingSpot = await spotStorage.getSpotById(spotId);
      if (!existingSpot) {
        return res.status(404).json({ message: "Spot not found" });
      }
      if (existingSpot.createdBy !== req.currentUser.id) {
        return res.status(403).json({ message: "You can only edit your own spots" });
      }

      const result = insertSpotSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: result.error.flatten().fieldErrors 
        });
      }

      const updatedSpot = await spotStorage.updateSpot(spotId, result.data);
      res.json(updatedSpot);
    } catch (error) {
      logger.error('Failed to update spot', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: 'Failed to update spot' });
    }
  });

  // DELETE /api/spots/:id - Delete a spot (soft delete)
  app.delete("/api/spots/:id", authenticateUser, publicWriteLimiter, async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "You must be logged in to delete a spot" });
      }

      const spotId = parseInt(req.params.id);
      if (isNaN(spotId)) {
        return res.status(400).json({ message: "Invalid spot ID" });
      }

      // Check ownership
      const existingSpot = await spotStorage.getSpotById(spotId);
      if (!existingSpot) {
        return res.status(404).json({ message: "Spot not found" });
      }
      if (existingSpot.createdBy !== req.currentUser.id) {
        return res.status(403).json({ message: "You can only delete your own spots" });
      }

      await spotStorage.deleteSpot(spotId);
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete spot', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: 'Failed to delete spot' });
    }
  });

  // POST /api/spots/:id/checkin - Check in at a spot
  app.post("/api/spots/:id/checkin", authenticateUser, publicWriteLimiter, async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "You must be logged in to check in" });
      }

      const spotId = parseInt(req.params.id);
      if (isNaN(spotId)) {
        return res.status(400).json({ message: "Invalid spot ID" });
      }

      const spot = await spotStorage.getSpotById(spotId);
      if (!spot) {
        return res.status(404).json({ message: "Spot not found" });
      }

      await spotStorage.incrementCheckIn(spotId);
      res.json({ message: "Checked in successfully", checkInCount: spot.checkInCount + 1 });
    } catch (error) {
      logger.error('Failed to check in', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: 'Failed to check in' });
    }
  });

  // POST /api/spots/:id/rate - Rate a spot
  app.post("/api/spots/:id/rate", authenticateUser, publicWriteLimiter, async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "You must be logged in to rate" });
      }

      const spotId = parseInt(req.params.id);
      if (isNaN(spotId)) {
        return res.status(400).json({ message: "Invalid spot ID" });
      }

      const { rating } = req.body;
      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }

      const spot = await spotStorage.getSpotById(spotId);
      if (!spot) {
        return res.status(404).json({ message: "Spot not found" });
      }

      await spotStorage.updateRating(spotId, rating);
      res.json({ message: "Rating submitted" });
    } catch (error) {
      logger.error('Failed to rate spot', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: 'Failed to rate spot' });
    }
  });

  // 3. Create HTTP Server
  const httpServer = createServer(app);
  return httpServer;
}
