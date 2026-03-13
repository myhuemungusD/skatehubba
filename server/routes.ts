import type { Express } from "express";
import express from "express";
import { setupAuthRoutes } from "./auth/routes";
import { authenticateUser, requireAdmin } from "./auth/middleware";
import { requirePaidOrPro } from "./middleware/requirePaidOrPro";
import { emailSignupLimiter, profileReadLimiter, remoteSkateLimiter } from "./middleware/security";
import { bandwidthDetection } from "./middleware/bandwidth";
import { UPLOAD_BODY_PARSE_LIMIT } from "./config/server";
import { analyticsRouter } from "./routes/analytics";
import { metricsRouter } from "./routes/metrics";
import { moderationRouter } from "./routes/moderation";
import { adminRouter } from "./routes/admin";
import { profileRouter } from "./routes/profile";
import { gamesRouter } from "./routes/games";
import { trickmintRouter } from "./routes/trickmint";
import { tierRouter } from "./routes/tier";
import { stripeWebhookRouter } from "./routes/stripeWebhook";
import { notificationsRouter } from "./routes/notifications";
import { remoteSkateRouter } from "./routes/remoteSkate";
import { spotsRouter } from "./routes/spots";
import { postsRouter } from "./routes/posts";
import { usersRouter } from "./routes/users";
import { matchmakingRouter } from "./routes/matchmaking";
import { betaSignupRouter } from "./routes/betaSignup";
import { statsRouter } from "./routes/stats";
import { cronRouter } from "./routes/cron";
import { tutorialRouter } from "./routes/tutorial";

export function registerRoutes(app: Express): void {
  setupAuthRoutes(app);

  app.use("/api/analytics", analyticsRouter);
  app.use("/api/metrics", authenticateUser, requireAdmin, metricsRouter);
  app.use("/api", moderationRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/profile", profileReadLimiter, profileRouter);
  app.use("/api/games", authenticateUser, gamesRouter);
  app.use(
    "/api/trickmint",
    express.json({ limit: UPLOAD_BODY_PARSE_LIMIT }),
    authenticateUser,
    requirePaidOrPro,
    bandwidthDetection,
    trickmintRouter
  );
  app.use("/api/tier", tierRouter);
  app.use("/webhooks/stripe", stripeWebhookRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/remote-skate", remoteSkateLimiter, authenticateUser, remoteSkateRouter);
  app.use("/api/spots", express.json({ limit: UPLOAD_BODY_PARSE_LIMIT }), spotsRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/matchmaking", matchmakingRouter);
  app.use("/api/beta-signup", emailSignupLimiter, betaSignupRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/cron", cronRouter);
  app.use("/api/tutorial", tutorialRouter);
  app.use("/api", tutorialRouter); // mounts /api/users/:userId/progress and /api/users/:userId/onboarding
}
