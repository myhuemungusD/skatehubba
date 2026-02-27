import type { Express } from "express";
import { setupAuthRoutes } from "./auth/routes";
import { authenticateUser, requireAdmin } from "./auth/middleware";
import { requirePaidOrPro } from "./middleware/requirePaidOrPro";
import {
  emailSignupLimiter,
  profileReadLimiter,
  remoteSkateActionLimiter,
} from "./middleware/security";
import { bandwidthDetection } from "./middleware/bandwidth";
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
    authenticateUser,
    requirePaidOrPro,
    bandwidthDetection,
    trickmintRouter
  );
  app.use("/api/tier", tierRouter);
  app.use("/webhooks/stripe", stripeWebhookRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/remote-skate", authenticateUser, remoteSkateActionLimiter, remoteSkateRouter);
  app.use("/api/spots", spotsRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/matchmaking", matchmakingRouter);
  app.use("/api/beta-signup", emailSignupLimiter, betaSignupRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/cron", cronRouter);
}
