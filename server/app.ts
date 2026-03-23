/**
 * Express Application Factory — MVP
 *
 * Security: helmet, CORS, rate limiting, JSON parsing, API routes, error handler.
 * No Redis, no Sentry, no CSRF, no Stripe, no monitoring, no sitemap.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import logger from "./logger";
import { registerRoutes } from "./routes";
import { DatabaseUnavailableError, isDatabaseAvailable } from "./db";

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", 1);

  // Security headers
  app.use(helmet());

  // CORS
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === "development") {
    allowedOrigins.push("http://localhost:3000", "http://localhost:5173");
  }

  if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
    logger.warn("ALLOWED_ORIGINS is empty in production — CORS will reject all cross-origin requests");
  }

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : process.env.NODE_ENV !== "production",
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Rate limiting — general API
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "RATE_LIMITED", message: "Too many requests. Please try again later." },
  });
  app.use("/api", apiLimiter);

  // Strict rate limit on auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // 20 auth attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "RATE_LIMITED", message: "Too many authentication attempts. Please wait." },
  });
  app.use("/api/auth", authLimiter);

  // Health check
  app.get("/api/health", (_req, res) => {
    const dbUp = isDatabaseAvailable();
    const status = dbUp ? "ok" : "degraded";
    res.status(dbUp ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      database: dbUp ? "connected" : "unavailable",
    });
  });

  // Register all API routes
  registerRoutes(app);

  // API 404 catch-all
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Global error handler
  app.use(
    (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof DatabaseUnavailableError) {
        logger.warn("[App] Database unavailable", { route: req.path });
        if (!res.headersSent) {
          res.status(503).json({ error: "DATABASE_UNAVAILABLE", message: "Database unavailable." });
        }
        return;
      }

      logger.error("[App] Unhandled error", {
        route: req.path,
        method: req.method,
        name: err?.name,
        message: err?.message,
        stack: process.env.NODE_ENV !== "production" ? err?.stack : undefined,
      });

      if (!res.headersSent) {
        res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." });
      }
    }
  );

  return app;
}
