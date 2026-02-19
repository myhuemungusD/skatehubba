/**
 * Express Application Factory
 *
 * Creates and configures the Express app with all middleware and API routes.
 * Shared between:
 *   - server/index.ts  (standalone Docker / Node.js server)
 *   - api/index.ts     (Vercel serverless function)
 */
import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import logger from "./logger.ts";
import { ensureCsrfToken, requireCsrfToken } from "./middleware/csrf.ts";
import { apiLimiter } from "./middleware/security.ts";
import { requestTracing } from "./middleware/requestTracing.ts";
import { metricsMiddleware, registerMonitoringRoutes } from "./monitoring/index.ts";
import { DEV_ORIGINS, BODY_PARSE_LIMIT } from "./config/server.ts";
import { registerRoutes } from "./routes.ts";
import swaggerUi from "swagger-ui-express";
import { generateOpenAPISpec } from "./api-docs/index.ts";

export function createApp(): express.Express {
  const app = express();

  // Trust the first proxy hop so req.ip / req.ips reflect the real client address.
  // Without this, rate limiting and IP-based audit logging see only the proxy IP.
  app.set("trust proxy", 1);

  // Request metrics collection
  app.use(metricsMiddleware());

  // Request tracing — generate/propagate request ID before anything else
  app.use(requestTracing);

  // Security middleware
  if (process.env.NODE_ENV === "production") {
    // Collect all Firebase Auth domains for CSP frame-src.
    const frameSrcDirective: string[] = ["'self'", "https://accounts.google.com"];

    if (process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN) {
      frameSrcDirective.push(`https://${process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN}`);
    }

    if (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) {
      const computedDomain = `${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`;
      if (!frameSrcDirective.includes(`https://${computedDomain}`)) {
        frameSrcDirective.push(`https://${computedDomain}`);
      }
    }

    if (frameSrcDirective.length === 2) {
      logger.warn(
        "Firebase Auth domain not configured - OAuth sign-in may fail. Set EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN or EXPO_PUBLIC_FIREBASE_PROJECT_ID."
      );
    }

    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https:"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "https://firebasestorage.googleapis.com", "blob:"],
            frameSrc: frameSrcDirective,
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
          },
        },
        crossOriginEmbedderPolicy: false, // required for cross-origin images/media
        crossOriginOpenerPolicy: { policy: "same-origin" },
        crossOriginResourcePolicy: { policy: "same-site" },
      })
    );

    // Permissions-Policy: restrict browser features the app doesn't use
    app.use((_req, res, next) => {
      res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
      );
      next();
    });
  }

  // CORS configuration
  const corsOptions = {
    origin: function (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) {
      const allowed = process.env.ALLOWED_ORIGINS?.split(",") || [];
      const allAllowed =
        process.env.NODE_ENV === "production" ? allowed : [...allowed, ...DEV_ORIGINS];
      // Allow requests with no origin (mobile apps, server-to-server) or matching allowed domains
      if (!origin || allAllowed.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  };
  app.use(cors(corsOptions));

  // Compression
  app.use(compression());

  // OpenAPI / Swagger UI — disabled in production to prevent API surface exposure
  const openApiSpec = generateOpenAPISpec();
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/docs/openapi.json", (_req, res) => res.json(openApiSpec));
    app.use(
      "/api/docs",
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, {
        customSiteTitle: "SkateHubba API Docs",
        customCss: ".swagger-ui .topbar { background-color: #667eea; }",
        swaggerOptions: { persistAuthorization: true },
      })
    );
  }

  // Raw body for Stripe webhook signature verification (MUST precede express.json())
  app.use("/webhooks/stripe", express.raw({ type: "application/json" }));

  // Body parsing (before CSRF to enable JSON/form requests)
  app.use(express.json({ limit: BODY_PARSE_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_PARSE_LIMIT }));

  // Cookie parsing - MUST come before CSRF token creation
  app.use(cookieParser());

  // CSRF protection (double-submit cookie pattern) - MUST come after cookieParser
  app.use(ensureCsrfToken);

  // Global rate limiting for all API routes (before CSRF validation for better error handling)
  app.use("/api", apiLimiter);

  // Global CSRF validation for all state-changing API requests
  app.use("/api", requireCsrfToken);

  // Register all API routes
  registerRoutes(app);

  // Monitoring: health checks, readiness probes, system status
  registerMonitoringRoutes(app);

  return app;
}
