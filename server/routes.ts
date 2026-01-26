import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuthRoutes } from "./auth/routes";
import { spotStorage } from "./storage/spots";
import { getDb, isDatabaseAvailable } from "./db";
import { customUsers, spots, games } from "@shared/schema";
import { ilike, or, eq, count, sql } from "drizzle-orm";
import { insertSpotSchema } from "@shared/schema";
import {
  checkInIpLimiter,
  perUserCheckInLimiter,
  perUserSpotWriteLimiter,
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
import { validateBody } from "./middleware/validation";
import { SpotCheckInSchema, type SpotCheckInRequest } from "@shared/validation/spotCheckIn";
import { logAuditEvent } from "./services/auditLog";
import { verifyReplayProtection } from "./services/replayProtection";
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

  app.get("/api/spots/:spotId", async (req, res) => {
    const spotId = Number(req.params.spotId);
    if (Number.isNaN(spotId)) {
      return res.status(400).json({ message: "Invalid spot ID" });
    }

    const spot = await spotStorage.getSpotById(spotId);
    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }

    return res.json(spot);
  });

  const spotRatingSchema = z.object({
    rating: z.number().int().min(1).max(5),
  });

  app.post(
    "/api/spots/:spotId/rate",
    authenticateUser,
    validateBody(spotRatingSchema),
    async (req, res) => {
      const spotId = Number(req.params.spotId);
      if (Number.isNaN(spotId)) {
        return res.status(400).json({ message: "Invalid spot ID" });
      }

      const { rating } = (req as Request & { validatedBody: { rating: number } }).validatedBody;

      await spotStorage.updateRating(spotId, rating);
      const updated = await spotStorage.getSpotById(spotId);

      if (!updated) {
        return res.status(404).json({ message: "Spot not found" });
      }

      return res.status(200).json(updated);
    }
  );

  app.post(
    "/api/spots",
    authenticateUser,
    publicWriteLimiter,
    perUserSpotWriteLimiter,
    requireCsrfToken,
    validateBody(insertSpotSchema),
    async (req, res) => {
      type InsertSpot = z.infer<typeof insertSpotSchema>;
      const spotPayload = req.body as InsertSpot;

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

  app.post(
    "/api/spots/check-in",
    authenticateUser,
    enforceTrustAction("checkin"),
    async (req, res) => {
      const parsed = SpotCheckInSchema.safeParse(req.body);
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

    if (!req.currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const post = await createPost(req.currentUser.id, parsed.data);
    return res.status(201).json({ postId: post.id });
  });

  app.post(
    "/api/spots/check-in",
    authenticateUser,
    checkInIpLimiter,
    perUserCheckInLimiter,
    validateBody(SpotCheckInSchema),
    async (req, res) => {
      const parsedBody = req.body as SpotCheckInRequest;

      const userId = req.currentUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { spotId, lat, lng, nonce, clientTimestamp } = parsedBody;

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
          replayCheck.reason === "replay_detected"
            ? "Replay detected"
            : "Invalid check-in timestamp";
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
        const result = await verifyAndCheckIn(userId, spotId, lat, lng);
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
          return res.status(403).json({ message: result.message });
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

  app.post(
    "/api/beta-signup",
    validateBody(BetaSignupInput, { errorCode: "VALIDATION_ERROR" }),
    async (req, res) => {
      const { email, platform } = req.body as BetaSignupInput;
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
    }
  );

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
