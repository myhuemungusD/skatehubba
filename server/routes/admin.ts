import { Router } from "express";
import { z } from "zod";
import { eq, desc, and, sql, count, ilike, or, inArray, gte, lte } from "drizzle-orm";
import { authenticateUser, requireAdmin } from "../auth/middleware";
import { enforceAdminRateLimit, enforceNotBanned } from "../middleware/trustSafety";
import { getDb, isDatabaseAvailable } from "../db";
import {
  customUsers,
  moderationProfiles,
  moderationReports,
  modActions,
  auditLogs,
  orders,
} from "@shared/schema";
import logger from "../logger";

export const adminRouter = Router();

const adminMiddleware = [
  authenticateUser,
  requireAdmin,
  enforceAdminRateLimit(),
  enforceNotBanned(),
];

// ─── Dashboard Overview Stats ─────────────────────────────────────────────────

adminRouter.get("/stats", ...adminMiddleware, async (_req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "database_not_available" });
  }

  try {
    const db = getDb();

    const [
      [usersCount],
      [reportsQueued],
      [reportsTotal],
      [actionsCount],
      [bannedCount],
      [ordersCount],
    ] = await Promise.all([
      db.select({ value: count() }).from(customUsers),
      db
        .select({ value: count() })
        .from(moderationReports)
        .where(eq(moderationReports.status, "queued")),
      db.select({ value: count() }).from(moderationReports),
      db.select({ value: count() }).from(modActions),
      db
        .select({ value: count() })
        .from(moderationProfiles)
        .where(eq(moderationProfiles.isBanned, true)),
      db.select({ value: count() }).from(orders),
    ]);

    return res.json({
      totalUsers: usersCount?.value ?? 0,
      queuedReports: reportsQueued?.value ?? 0,
      totalReports: reportsTotal?.value ?? 0,
      totalModActions: actionsCount?.value ?? 0,
      bannedUsers: bannedCount?.value ?? 0,
      totalOrders: ordersCount?.value ?? 0,
    });
  } catch (error) {
    logger.error("[Admin] Stats query failed", { error });
    return res.status(500).json({ error: "query_failed" });
  }
});

// ─── User Management ──────────────────────────────────────────────────────────

adminRouter.get("/users", ...adminMiddleware, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "database_not_available" });
  }

  try {
    const db = getDb();
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    // Escape SQL LIKE wildcards to prevent wildcard injection
    const sanitizedSearch = search?.replace(/[%_\\]/g, (c) => `\\${c}`);
    const searchCondition = sanitizedSearch
      ? or(
          ilike(customUsers.email, `%${sanitizedSearch}%`),
          ilike(customUsers.firstName, `%${sanitizedSearch}%`),
          ilike(customUsers.lastName, `%${sanitizedSearch}%`)
        )
      : undefined;

    const [users, [totalRow]] = await Promise.all([
      db
        .select({
          id: customUsers.id,
          email: customUsers.email,
          firstName: customUsers.firstName,
          lastName: customUsers.lastName,
          accountTier: customUsers.accountTier,
          trustLevel: customUsers.trustLevel,
          isActive: customUsers.isActive,
          isEmailVerified: customUsers.isEmailVerified,
          lastLoginAt: customUsers.lastLoginAt,
          createdAt: customUsers.createdAt,
        })
        .from(customUsers)
        .where(searchCondition)
        .orderBy(desc(customUsers.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(customUsers).where(searchCondition),
    ]);

    // Fetch moderation profiles for these users
    const userIds = users.map((u) => u.id);
    let modProfiles: Array<{
      userId: string;
      isBanned: boolean;
      banExpiresAt: Date | null;
      reputationScore: number;
      proVerificationStatus: string;
      isProVerified: boolean;
    }> = [];

    if (userIds.length > 0) {
      modProfiles = await db
        .select({
          userId: moderationProfiles.userId,
          isBanned: moderationProfiles.isBanned,
          banExpiresAt: moderationProfiles.banExpiresAt,
          reputationScore: moderationProfiles.reputationScore,
          proVerificationStatus: moderationProfiles.proVerificationStatus,
          isProVerified: moderationProfiles.isProVerified,
        })
        .from(moderationProfiles)
        .where(inArray(moderationProfiles.userId, userIds));
    }

    const modProfileMap = new Map(modProfiles.map((p) => [p.userId, p]));

    const enrichedUsers = users.map((u) => ({
      ...u,
      moderation: modProfileMap.get(u.id) ?? null,
    }));

    return res.json({
      users: enrichedUsers,
      total: totalRow?.value ?? 0,
      page,
      limit,
    });
  } catch (error) {
    logger.error("[Admin] Users query failed", { error });
    return res.status(500).json({ error: "query_failed" });
  }
});

// ─── Update Trust Level ───────────────────────────────────────────────────────

const trustLevelSchema = z.object({
  trustLevel: z.number().int().min(0).max(2),
});

adminRouter.patch("/users/:userId/trust-level", ...adminMiddleware, async (req, res) => {
  const parsed = trustLevelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_TRUST_LEVEL", issues: parsed.error.flatten() });
  }

  const { userId } = req.params;
  const { trustLevel } = parsed.data;

  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "database_not_available" });
  }

  try {
    const db = getDb();
    const now = new Date();

    // Update trust level on the customUsers table
    const [updated] = await db
      .update(customUsers)
      .set({ trustLevel, updatedAt: now })
      .where(eq(customUsers.id, userId))
      .returning({ id: customUsers.id });

    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    // Also upsert the moderation profile
    await db
      .insert(moderationProfiles)
      .values({
        userId,
        trustLevel,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: moderationProfiles.userId,
        set: { trustLevel, updatedAt: now },
      });

    logger.info("[Admin] Trust level updated", {
      userId,
      trustLevel,
      adminId: req.currentUser?.id,
    });

    return res.json({ success: true, userId, trustLevel });
  } catch (error) {
    logger.error("[Admin] Trust level update failed", { error });
    return res.status(500).json({ error: "update_failed" });
  }
});

// ─── Update Report Status ─────────────────────────────────────────────────────

const reportStatusSchema = z.object({
  status: z.enum(["queued", "reviewing", "resolved", "dismissed", "escalated"]),
});

adminRouter.patch("/reports/:reportId/status", ...adminMiddleware, async (req, res) => {
  const parsed = reportStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_STATUS", issues: parsed.error.flatten() });
  }

  const { reportId } = req.params;
  const { status } = parsed.data;

  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "database_not_available" });
  }

  try {
    const db = getDb();

    const [updated] = await db
      .update(moderationReports)
      .set({ status })
      .where(eq(moderationReports.id, reportId))
      .returning({ id: moderationReports.id });

    if (!updated) {
      return res.status(404).json({ error: "Report not found" });
    }

    logger.info("[Admin] Report status updated", {
      reportId,
      status,
      adminId: req.currentUser?.id,
    });

    return res.json({ success: true, reportId, status });
  } catch (error) {
    logger.error("[Admin] Report status update failed", { error });
    return res.status(500).json({ error: "update_failed" });
  }
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────

adminRouter.get("/audit-logs", ...adminMiddleware, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "database_not_available" });
  }

  try {
    const db = getDb();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const eventType = typeof req.query.eventType === "string" ? req.query.eventType : undefined;
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const success =
      typeof req.query.success === "string" ? req.query.success === "true" : undefined;

    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;

    const conditions = [];
    if (eventType) {
      conditions.push(eq(auditLogs.eventType, eventType));
    }
    if (userId) {
      conditions.push(eq(auditLogs.userId, userId));
    }
    if (success !== undefined) {
      conditions.push(eq(auditLogs.success, success));
    }
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(auditLogs.createdAt, fromDate));
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(auditLogs.createdAt, toDate));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, [totalRow]] = await Promise.all([
      db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(auditLogs).where(whereClause),
    ]);

    return res.json({
      logs,
      total: totalRow?.value ?? 0,
      page,
      limit,
    });
  } catch (error) {
    logger.error("[Admin] Audit logs query failed", { error });
    return res.status(500).json({ error: "query_failed" });
  }
});

// ─── Mod Actions History ──────────────────────────────────────────────────────

adminRouter.get("/mod-actions", ...adminMiddleware, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "database_not_available" });
  }

  try {
    const db = getDb();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [actions, [totalRow]] = await Promise.all([
      db.select().from(modActions).orderBy(desc(modActions.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(modActions),
    ]);

    return res.json({
      actions,
      total: totalRow?.value ?? 0,
      page,
      limit,
    });
  } catch (error) {
    logger.error("[Admin] Mod actions query failed", { error });
    return res.status(500).json({ error: "query_failed" });
  }
});

// ─── Admin Tier Override ─────────────────────────────────────────────────────

const tierOverrideSchema = z.object({
  accountTier: z.enum(["free", "pro", "premium"]),
});

adminRouter.patch("/users/:userId/tier", ...adminMiddleware, async (req, res) => {
  const parsed = tierOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_TIER", issues: parsed.error.flatten() });
  }

  const { userId } = req.params;
  const { accountTier } = parsed.data;

  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "database_not_available" });
  }

  try {
    const db = getDb();
    const now = new Date();

    const [updated] = await db
      .update(customUsers)
      .set({
        accountTier,
        updatedAt: now,
        ...(accountTier === "premium" ? { premiumPurchasedAt: now } : {}),
        ...(accountTier === "free" ? { proAwardedBy: null, premiumPurchasedAt: null } : {}),
      })
      .where(eq(customUsers.id, userId))
      .returning({ id: customUsers.id });

    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    logger.info("[Admin] Tier override applied", {
      userId,
      accountTier,
      adminId: req.currentUser?.id,
    });

    return res.json({ success: true, userId, accountTier });
  } catch (error) {
    logger.error("[Admin] Tier override failed", { error });
    return res.status(500).json({ error: "update_failed" });
  }
});
