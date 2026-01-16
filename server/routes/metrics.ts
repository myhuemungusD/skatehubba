import type { Request, Response } from "express";
import { Router } from "express";
import { db } from "../db";
import { authenticateUser } from "../auth/middleware";
import {
  WAB_AU_SNAPSHOT,
  WAB_AU_TREND_12_WEEKS,
  UPLOADS_WITH_RESPONSE_48H,
  VOTES_PER_BATTLE,
  CREW_JOIN_RATE,
  D7_RETENTION,
  KPI_DASHBOARD,
} from "../analytics/queries";
import logger from "../logger";

export const metricsRouter = Router();

/**
 * Check if user has admin role
 */
function requireAdmin(req: Request, res: Response, next: () => void) {
  const user = req.currentUser;
  if (!user?.roles?.includes("admin")) {
    return res.status(403).json({ error: "admin_required" });
  }
  next();
}

/**
 * GET /api/metrics/wab-au
 *
 * Returns current WAB/AU snapshot (last 7 days)
 * Admin only.
 */
metricsRouter.get(
  "/wab-au",
  authenticateUser,
  requireAdmin,
  async (_req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ error: "database_not_available" });
    }

    try {
      const result = await db.execute(WAB_AU_SNAPSHOT as any);
      return res.json(result.rows[0] || { wab: 0, au: 0, wab_per_au: 0 });
    } catch (error) {
      logger.error("[Metrics] WAB/AU query failed", { error });
      return res.status(500).json({ error: "query_failed" });
    }
  }
);

/**
 * GET /api/metrics/wab-au/trend
 *
 * Returns WAB/AU trend over last 12 weeks
 * Admin only. Dashboard-ready time series.
 */
metricsRouter.get(
  "/wab-au/trend",
  authenticateUser,
  requireAdmin,
  async (_req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ error: "database_not_available" });
    }

    try {
      const result = await db.execute(WAB_AU_TREND_12_WEEKS as any);
      return res.json(result.rows);
    } catch (error) {
      logger.error("[Metrics] WAB/AU trend query failed", { error });
      return res.status(500).json({ error: "query_failed" });
    }
  }
);

/**
 * GET /api/metrics/kpi
 *
 * Returns all KPI metrics in a single response.
 * Admin only.
 */
metricsRouter.get("/kpi", authenticateUser, requireAdmin, async (_req: Request, res: Response) => {
  if (!db) {
    return res.status(503).json({ error: "database_not_available" });
  }

  try {
    const result = await db.execute(KPI_DASHBOARD as any);
    return res.json(result.rows[0] || {});
  } catch (error) {
    logger.error("[Metrics] KPI dashboard query failed", { error });
    return res.status(500).json({ error: "query_failed" });
  }
});

/**
 * GET /api/metrics/response-rate
 *
 * Returns % uploads with response in 48h
 * Admin only.
 */
metricsRouter.get(
  "/response-rate",
  authenticateUser,
  requireAdmin,
  async (_req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ error: "database_not_available" });
    }

    try {
      const result = await db.execute(UPLOADS_WITH_RESPONSE_48H as any);
      return res.json(result.rows[0] || {});
    } catch (error) {
      logger.error("[Metrics] Response rate query failed", { error });
      return res.status(500).json({ error: "query_failed" });
    }
  }
);

/**
 * GET /api/metrics/votes-per-battle
 *
 * Returns average votes per battle
 * Admin only.
 */
metricsRouter.get(
  "/votes-per-battle",
  authenticateUser,
  requireAdmin,
  async (_req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ error: "database_not_available" });
    }

    try {
      const result = await db.execute(VOTES_PER_BATTLE as any);
      return res.json(result.rows[0] || {});
    } catch (error) {
      logger.error("[Metrics] Votes per battle query failed", { error });
      return res.status(500).json({ error: "query_failed" });
    }
  }
);

/**
 * GET /api/metrics/crew-join-rate
 *
 * Returns crew join rate
 * Admin only.
 */
metricsRouter.get(
  "/crew-join-rate",
  authenticateUser,
  requireAdmin,
  async (_req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ error: "database_not_available" });
    }

    try {
      const result = await db.execute(CREW_JOIN_RATE as any);
      return res.json(result.rows[0] || {});
    } catch (error) {
      logger.error("[Metrics] Crew join rate query failed", { error });
      return res.status(500).json({ error: "query_failed" });
    }
  }
);

/**
 * GET /api/metrics/retention
 *
 * Returns D7 retention rate
 * Admin only.
 */
metricsRouter.get(
  "/retention",
  authenticateUser,
  requireAdmin,
  async (_req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ error: "database_not_available" });
    }

    try {
      const result = await db.execute(D7_RETENTION as any);
      return res.json(result.rows[0] || {});
    } catch (error) {
      logger.error("[Metrics] Retention query failed", { error });
      return res.status(500).json({ error: "query_failed" });
    }
  }
);
