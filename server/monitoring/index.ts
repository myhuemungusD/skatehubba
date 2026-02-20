/**
 * Monitoring Module
 *
 * Centralised observability for SkateHubba:
 *   - Request metrics middleware (latency, status codes, error rates)
 *   - /api/health endpoint with deep checks (DB, Redis, ffmpeg)
 *   - /api/health/live for liveness probes
 *   - /api/health/ready for readiness probes
 *   - /api/admin/system-status for the admin dashboard
 *
 * Sentry integration is handled separately by server/sentry.js.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { isDatabaseAvailable, getDb } from "../db";
import { getRedisClient } from "../redis";
import logger from "../logger";
import { sql } from "drizzle-orm";
import { checkFfmpegAvailable } from "../services/videoTranscoder";
import { authenticateUser, requireAdmin } from "../auth/middleware";

// ============================================================================
// Types
// ============================================================================

interface RequestMetrics {
  totalRequests: number;
  totalErrors: number;
  statusCodes: Record<number, number>;
  latencyHistogram: number[]; // last 1000 request latencies (ms)
  startedAt: Date;
}

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  timestamp: string;
  version: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    ffmpeg: ComponentHealth;
  };
}

interface ComponentHealth {
  status: "up" | "down" | "unconfigured";
  latencyMs?: number;
  detail?: string;
}

interface SystemStatus {
  health: HealthCheckResult;
  metrics: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    uptimeSeconds: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    requestsPerMinute: number;
    topStatusCodes: Array<{ code: number; count: number }>;
  };
  process: {
    memoryUsageMb: number;
    heapUsedMb: number;
    cpuUser: number;
    cpuSystem: number;
    pid: number;
    nodeVersion: string;
  };
}

// ============================================================================
// In-memory metrics store (ring buffer for latencies)
// ============================================================================

const metrics: RequestMetrics = {
  totalRequests: 0,
  totalErrors: 0,
  statusCodes: {},
  latencyHistogram: [],
  startedAt: new Date(),
};

const MAX_LATENCY_SAMPLES = 1000;

function recordRequest(statusCode: number, latencyMs: number) {
  metrics.totalRequests++;
  metrics.statusCodes[statusCode] = (metrics.statusCodes[statusCode] || 0) + 1;
  if (statusCode >= 500) metrics.totalErrors++;

  metrics.latencyHistogram.push(latencyMs);
  if (metrics.latencyHistogram.length > MAX_LATENCY_SAMPLES) {
    metrics.latencyHistogram.shift();
  }
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ============================================================================
// Request metrics middleware
// ============================================================================

export function metricsMiddleware() {
  return (_req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationMs = Math.round(durationNs / 1_000_000);
      recordRequest(res.statusCode, durationMs);
    });

    next();
  };
}

// ============================================================================
// Health check: deep probe of all dependencies
// ============================================================================

async function checkDatabase(): Promise<ComponentHealth> {
  if (!isDatabaseAvailable()) {
    return { status: "down", detail: "Database not initialised" };
  }
  const start = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err) {
    return { status: "down", latencyMs: Date.now() - start, detail: String(err) };
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  const client = getRedisClient();
  if (!client) {
    return { status: "unconfigured" };
  }
  const start = Date.now();
  try {
    await client.ping();
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err) {
    return { status: "down", latencyMs: Date.now() - start, detail: String(err) };
  }
}

async function checkFfmpeg(): Promise<ComponentHealth> {
  const start = Date.now();
  const result = await checkFfmpegAvailable();
  if (result.ffmpeg && result.ffprobe) {
    return { status: "up", latencyMs: Date.now() - start };
  }
  return {
    status: "down",
    latencyMs: Date.now() - start,
    detail: `ffmpeg: ${result.ffmpeg}, ffprobe: ${result.ffprobe}`,
  };
}

async function runHealthCheck(): Promise<HealthCheckResult> {
  const [database, redis, ffmpeg] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkFfmpeg(),
  ]);

  const checks = { database, redis, ffmpeg };

  // Determine overall status
  let status: HealthCheckResult["status"] = "healthy";
  if (database.status === "down") status = "unhealthy";
  else if (redis.status === "down" || ffmpeg.status === "down") status = "degraded";

  return {
    status,
    uptime: Math.round((Date.now() - metrics.startedAt.getTime()) / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "unknown",
    checks,
  };
}

// ============================================================================
// Route handlers
// ============================================================================

export function registerMonitoringRoutes(app: Express) {
  // Liveness probe — always returns 200 if process is running
  app.get("/api/health/live", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness probe — checks all dependencies
  app.get("/api/health/ready", async (_req, res) => {
    const health = await runHealthCheck();
    const httpStatus = health.status === "unhealthy" ? 503 : 200;
    res.status(httpStatus).json(health);
  });

  // Deep health check (replaces the previous simple /api/health)
  // Returns 503 for both degraded AND unhealthy — every dependency must be up.
  // Use /api/health/ready for lenient k8s-style readiness (tolerates degraded).
  app.get("/api/health", async (_req, res) => {
    const health = await runHealthCheck();
    const httpStatus = health.status === "healthy" ? 200 : 503;
    res.status(httpStatus).json(health);
  });

  // Environment diagnostics — reports which server-side vars are present/missing.
  // No auth required (diagnostic tool); values are never exposed, only boolean presence.
  // Returns 503 if required vars are missing or DB is down.
  app.get("/api/health/env", async (_req, res) => {
    const serverRequired = ["DATABASE_URL", "SESSION_SECRET", "JWT_SECRET"];
    const firebaseAdmin = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
    const firebaseClient = [
      "EXPO_PUBLIC_FIREBASE_API_KEY",
      "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
      "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "EXPO_PUBLIC_FIREBASE_APP_ID",
    ];

    const checkVars = (names: string[]) =>
      names.map((name) => ({
        name,
        set: typeof process.env[name] === "string" && process.env[name]!.trim().length > 0,
      }));

    const dbHealth = await checkDatabase();

    // Firebase Admin SDK initialization status
    let firebaseAdminStatus: "initialized" | "not_initialized" | "error" = "not_initialized";
    try {
      const adminModule = await import("firebase-admin");
      firebaseAdminStatus = adminModule.default.apps.length > 0 ? "initialized" : "not_initialized";
    } catch {
      firebaseAdminStatus = "error";
    }

    const serverRequiredResults = checkVars(serverRequired);
    const allRequiredSet = serverRequiredResults.every((v) => v.set);
    const httpStatus = allRequiredSet && dbHealth.status === "up" ? 200 : 503;

    res.status(httpStatus).json({
      timestamp: new Date().toISOString(),
      vercelEnv: process.env.VERCEL_ENV ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      serverRequired: serverRequiredResults,
      firebaseAdmin: checkVars(firebaseAdmin),
      firebaseClient: checkVars(firebaseClient),
      database: {
        status: dbHealth.status,
        latencyMs: dbHealth.latencyMs,
        detail: dbHealth.detail,
      },
      firebaseAdminSdk: firebaseAdminStatus,
    });
  });

  // Admin-only system status (metrics + health + process info)
  app.get("/api/admin/system-status", authenticateUser, requireAdmin, async (_req, res) => {
    const health = await runHealthCheck();

    const uptimeSeconds = Math.round((Date.now() - metrics.startedAt.getTime()) / 1000);
    const requestsPerMinute =
      uptimeSeconds > 0 ? Math.round((metrics.totalRequests / uptimeSeconds) * 60) : 0;

    const topStatusCodes = Object.entries(metrics.statusCodes)
      .map(([code, count]) => ({ code: Number(code), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const systemStatus: SystemStatus = {
      health,
      metrics: {
        totalRequests: metrics.totalRequests,
        totalErrors: metrics.totalErrors,
        errorRate: metrics.totalRequests > 0 ? metrics.totalErrors / metrics.totalRequests : 0,
        uptimeSeconds,
        avgLatencyMs: Math.round(
          metrics.latencyHistogram.reduce((a, b) => a + b, 0) /
            (metrics.latencyHistogram.length || 1)
        ),
        p95LatencyMs: percentile(metrics.latencyHistogram, 95),
        p99LatencyMs: percentile(metrics.latencyHistogram, 99),
        requestsPerMinute,
        topStatusCodes,
      },
      process: {
        memoryUsageMb: Math.round(memUsage.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memUsage.heapUsed / (1024 * 1024)),
        cpuUser: cpuUsage.user,
        cpuSystem: cpuUsage.system,
        pid: process.pid,
        nodeVersion: process.version,
      },
    };

    res.json(systemStatus);
  });

  logger.info("[Monitoring] Health and metrics routes registered");
}
