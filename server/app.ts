/**
 * Express Application Factory — MVP
 *
 * Stripped to essentials: CORS, JSON parsing, API routes, error handler.
 * No Redis, no Sentry, no CSRF, no Stripe, no monitoring, no sitemap.
 */
import express from "express";
import cors from "cors";
import logger from "./logger";
import { registerRoutes } from "./routes";
import { DatabaseUnavailableError } from "./db";

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", 1);

  // CORS
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === "development") {
    allowedOrigins.push("http://localhost:3000", "http://localhost:5173");
  }

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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
