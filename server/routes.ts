import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuthRoutes } from "./auth/routes";
import { spotStorage } from "./storage/spots";
import { getDb, isDatabaseAvailable } from "./db";
import { customUsers, userProfiles, spots, games } from "@shared/schema";
import { ilike, or, eq, count } from "drizzle-orm";
import { insertSpotSchema } from "@shared/schema";
import {
  checkInIpLimiter,
  perUserCheckInLimiter,
  perUserSpotWriteLimiter,
  publicWriteLimiter,
} from "./middleware/security";
import { requireCsrfToken } from "./middleware/csrf";
import crypto from "node:crypto";
import type { z } from "zod";
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

  app.post(
    "/api/spots",
    publicWriteLimiter,
    perUserSpotWriteLimiter,
    requireCsrfToken,
    validateBody(insertSpotSchema),
    async (req, res) => {
      // Basic Auth Check: Ensure we have a user ID to bind the spot to
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "You must be logged in to create a spot" });
      }

      type InsertSpot = z.infer<typeof insertSpotSchema>;
      const spotPayload = req.body as InsertSpot;

      // Creation: Pass 'createdBy' from the authenticated session
      const spot = await spotStorage.createSpot({
        ...spotPayload,
        createdBy: req.currentUser?.id || "",
      });

      logAuditEvent({
        action: "spot.created",
        userId: req.currentUser?.id,
        ip: getClientIp(req),
        metadata: {
          spotId: spot.id,
          lat: spot.lat,
          lng: spot.lng,
        },
      });

      res.status(201).json(spot);
    }
  );

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
