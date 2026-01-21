import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuthRoutes } from "./auth/routes";
import { spotStorage } from "./storage/spots";
import { getDb, isDatabaseAvailable } from "./db";
import { customUsers, spots, games } from "@shared/schema";
import { ilike, or, eq, count, sql } from "drizzle-orm";
import { insertSpotSchema } from "@shared/schema";
import {
  filmerRequestLimiter,
  filmerRespondLimiter,
  publicWriteLimiter,
} from "./middleware/security";
import { requireCsrfToken } from "./middleware/csrf";
import { enforceTrustAction } from "./middleware/trustSafety";
import { z } from "zod";
import crypto from "node:crypto";
import { BetaSignupInput } from "@shared/validation/betaSignup";
import { admin } from "./admin";
import { env } from "./config/env";
import { authenticateUser } from "./auth/middleware";
import { verifyAndCheckIn } from "./services/spotService";
import { analyticsRouter } from "./routes/analytics";
import { metricsRouter } from "./routes/metrics";
import {
  handleFilmerRequest,
  handleFilmerRequestsList,
  handleFilmerRespond,
} from "./routes/filmer";
import { moderationRouter } from "./routes/moderation";
import { createPost } from "./services/moderationStore";
import { sendQuickMatchNotification } from "./services/notificationService";
import { profileRouter } from "./routes/profile";
import logger from "./logger";

export async function registerRoutes(app: Express): Promise<Server> {
  // 1. Setup Authentication (Passport session)
  setupAuthRoutes(app);

  // 2. Analytics Routes (Firebase UID auth, idempotent)
  app.use("/api/analytics", analyticsRouter);

  // 3. Metrics Routes (Admin only, for dashboard)
  app.use("/api/metrics", metricsRouter);

  // 3b. Moderation Routes
  app.use("/api", moderationRouter);

  // 3c. Profile Routes
  app.use("/api/profile", profileRouter);

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

  app.post(
    "/api/spots/check-in",
    authenticateUser,
    enforceTrustAction("checkin"),
    async (req, res) => {
      const parsed = checkInSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", issues: parsed.error.flatten() });
      }

      // authenticateUser guarantees req.currentUser is defined here (type narrowing)
      const userId = req.currentUser!.id;

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
    }
  );

  const postSchema = z.object({
    mediaUrl: z.string().url().max(2000),
    caption: z.string().max(300).optional(),
    spotId: z.number().int().optional(),
  });

  app.post("/api/posts", authenticateUser, enforceTrustAction("post"), async (req, res) => {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", issues: parsed.error.flatten() });
    }

    const userId = req.currentUser?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const post = await createPost(userId, parsed.data);
    return res.status(201).json({ postId: post.id });
  });

  // Filmer Credit Workflow
  app.post("/api/filmer/request", authenticateUser, filmerRequestLimiter, handleFilmerRequest);
  app.post("/api/filmer/respond", authenticateUser, filmerRespondLimiter, handleFilmerRespond);
  app.get("/api/filmer/requests", authenticateUser, handleFilmerRequestsList);

  const getClientIp = (req: Request): string | null => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0]?.trim() || null;
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0]?.trim() || null;
    }
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string" && realIp.trim()) {
      return realIp.trim();
    }
    if (Array.isArray(realIp) && realIp.length > 0) {
      return realIp[0]?.trim() || null;
    }
    return req.ip || null;
  };

  const hashIp = (ip: string, salt: string) =>
    crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex");

  const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

  const getTimestampMillis = (value: unknown) =>
    value instanceof admin.firestore.Timestamp ? value.toMillis() : null;

  app.post("/api/beta-signup", async (req, res) => {
    const parsed = BetaSignupInput.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const { email, platform } = parsed.data;
    const ip = getClientIp(req);
    const salt = env.IP_HASH_SALT || "";
    const ipHash = ip && salt ? hashIp(ip, salt) : undefined;

    try {
      const docId = crypto.createHash("sha256").update(email).digest("hex").slice(0, 32);

      const docRef = admin.firestore().collection("mail_list").doc(docId);
      const nowMillis = admin.firestore.Timestamp.now().toMillis();

      await admin.firestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(docRef);
        const data = snapshot.exists ? snapshot.data() : null;
        const lastSubmittedAtMillis =
          getTimestampMillis(data?.lastSubmittedAt) ?? getTimestampMillis(data?.createdAt);

        if (lastSubmittedAtMillis && nowMillis - lastSubmittedAtMillis < RATE_LIMIT_WINDOW_MS) {
          throw new Error("RATE_LIMITED");
        }

        if (snapshot.exists) {
          transaction.set(
            docRef,
            {
              platform,
              ...(ipHash ? { ipHash } : {}),
              lastSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
              submitCount: admin.firestore.FieldValue.increment(1),
              source: "skatehubba.com",
            },
            { merge: true }
          );
          return;
        }

        transaction.set(docRef, {
          email,
          platform,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
          submitCount: 1,
          ...(ipHash ? { ipHash } : {}),
          source: "skatehubba.com",
        });
      });

      return res.status(200).json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === "RATE_LIMITED") {
        return res.status(429).json({ ok: false, error: "RATE_LIMITED" });
      }
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  // 3. User Search and Browse Endpoints
  app.get("/api/users/search", authenticateUser, async (req, res) => {
    const queryParam = req.query.q;
    // Validate query parameter is a string (prevent array injection)
    if (typeof queryParam !== "string" || queryParam.length < 2) {
      return res.json([]);
    }
    const query = queryParam;

    if (!isDatabaseAvailable()) {
      return res.json([]);
    }

    try {
      const database = getDb();
      const searchTerm = `%${query}%`;
      const results = await database
        .select({
          id: customUsers.id,
          firstName: customUsers.firstName,
          lastName: customUsers.lastName,
          email: customUsers.email,
          firebaseUid: customUsers.firebaseUid,
        })
        .from(customUsers)
        .where(
          or(
            ilike(customUsers.firstName, searchTerm),
            ilike(customUsers.lastName, searchTerm),
            ilike(customUsers.email, searchTerm)
          )
        )
        .limit(20);

      const mapped = results.map((u) => ({
        id: u.id,
        displayName:
          u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName || "Skater",
        handle: `user${u.id.substring(0, 4)}`,
        wins: 0,
        losses: 0,
      }));

      res.json(mapped);
    } catch (_error) {
      res.json([]);
    }
  });

  app.get("/api/users", authenticateUser, async (req, res) => {
    if (!isDatabaseAvailable()) {
      return res.json([]);
    }

    try {
      const database = getDb();
      const results = await database
        .select({
          uid: customUsers.firebaseUid,
          email: customUsers.email,
          displayName: customUsers.firstName,
          photoURL: sql<string | null>`null`,
        })
        .from(customUsers)
        .where(eq(customUsers.isActive, true))
        .limit(100);

      res.json(results);
    } catch (_error) {
      res.json([]);
    }
  });

  // Quick Match Endpoint
  app.post("/api/matchmaking/quick-match", authenticateUser, async (req, res) => {
    const currentUserId = req.currentUser?.id;
    const currentUserName = req.currentUser?.firstName || "Skater";

    if (!currentUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!isDatabaseAvailable()) {
      return res.status(503).json({ error: "Service unavailable" });
    }

    try {
      const database = getDb();

      // Find an available opponent (exclude current user, select random user with push token)
      const availableOpponents = await database
        .select({
          id: customUsers.id,
          firebaseUid: customUsers.firebaseUid,
          firstName: customUsers.firstName,
          pushToken: customUsers.pushToken,
        })
        .from(customUsers)
        .where(eq(customUsers.isActive, true))
        .limit(50);

      // Filter out current user and users without push tokens
      const eligibleOpponents = availableOpponents.filter(
        (u) => u.id !== currentUserId && u.pushToken
      );

      if (eligibleOpponents.length === 0) {
        return res.status(404).json({
          error: "No opponents available",
          message: "No users found for quick match. Try again later.",
        });
      }

      // Select random opponent using unbiased cryptographically secure random
      // Use rejection sampling to avoid modulo bias
      const maxRange = Math.floor(0xffffffff / eligibleOpponents.length) * eligibleOpponents.length;
      let randomValue: number;
      do {
        const randomBytes = crypto.randomBytes(4);
        randomValue = randomBytes.readUInt32BE(0);
      } while (randomValue >= maxRange);

      const randomIndex = randomValue % eligibleOpponents.length;
      const opponent = eligibleOpponents[randomIndex];

      // In production, you would create a challenge record here
      // For now, we'll create a temporary challenge ID
      const challengeId = `qm-${Date.now()}-${currentUserId}-${opponent.id}`;

      // Send push notification to opponent
      if (opponent.pushToken) {
        await sendQuickMatchNotification(opponent.pushToken, currentUserName, challengeId);
      }

      logger.info("[Quick Match] Match found", {
        requesterId: currentUserId,
        opponentId: opponent.id,
        challengeId,
      });

      res.json({
        success: true,
        match: {
          opponentId: opponent.id,
          opponentName: opponent.firstName || "Skater",
          opponentFirebaseUid: opponent.firebaseUid,
          challengeId,
        },
      });
    } catch (error) {
      logger.error("[Quick Match] Failed to find match", { error, userId: currentUserId });
      res.status(500).json({ error: "Failed to find match" });
    }
  });

  // 4. Public Stats Endpoint (for landing page)
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
