/**
 * Notification Routes
 *
 * Handles:
 *   - Push token registration (POST /api/notifications/push-token)
 *   - Notification preferences CRUD (GET/PUT /api/notifications/preferences)
 *   - Notification feed (GET /api/notifications)
 *   - Mark as read (POST /api/notifications/:id/read)
 *   - Mark all as read (POST /api/notifications/read-all)
 *   - Unread count (GET /api/notifications/unread-count)
 */

import { Router } from "express";
import { z } from "zod";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import {
  customUsers,
  notifications,
  notificationPreferences,
  DEFAULT_NOTIFICATION_PREFS,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import logger from "../logger";

const router = Router();

// All notification routes require auth
router.use(authenticateUser);

// ============================================================================
// POST /api/notifications/push-token — Register/update push token
// ============================================================================

const pushTokenSchema = z.object({
  token: z.string().min(1).max(500),
});

router.post("/push-token", async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const userId = req.currentUser!.id;
  const { token } = parsed.data;

  try {
    const db = getDb();
    await db
      .update(customUsers)
      .set({ pushToken: token, updatedAt: new Date() })
      .where(eq(customUsers.id, userId));

    logger.info("[Notifications] Push token registered", { userId });
    res.json({ success: true });
  } catch (error) {
    logger.error("[Notifications] Failed to register push token", { error, userId });
    res.status(500).json({ error: "Failed to register push token" });
  }
});

// ============================================================================
// DELETE /api/notifications/push-token — Remove push token (on logout)
// ============================================================================

router.delete("/push-token", async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const userId = req.currentUser!.id;

  try {
    const db = getDb();
    await db
      .update(customUsers)
      .set({ pushToken: null, updatedAt: new Date() })
      .where(eq(customUsers.id, userId));

    res.json({ success: true });
  } catch (error) {
    logger.error("[Notifications] Failed to remove push token", { error, userId });
    res.status(500).json({ error: "Failed to remove push token" });
  }
});

// ============================================================================
// GET /api/notifications/preferences — Get notification preferences
// ============================================================================

router.get("/preferences", async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const userId = req.currentUser!.id;

  try {
    const db = getDb();
    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (!prefs) {
      return res.json(DEFAULT_NOTIFICATION_PREFS);
    }

    // Strip internal fields
    const { id: _id, userId: _userId, updatedAt: _updatedAt, ...publicPrefs } = prefs;
    res.json(publicPrefs);
  } catch (error) {
    logger.error("[Notifications] Failed to get preferences", { error, userId });
    res.status(500).json({ error: "Failed to get preferences" });
  }
});

// ============================================================================
// PUT /api/notifications/preferences — Update notification preferences
// ============================================================================

const preferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  gameNotifications: z.boolean().optional(),
  challengeNotifications: z.boolean().optional(),
  turnNotifications: z.boolean().optional(),
  resultNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
});

router.put("/preferences", async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const userId = req.currentUser!.id;
  const updates = parsed.data;

  try {
    const db = getDb();

    // Upsert: insert if not exists, update if exists
    const [existing] = await db
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(notificationPreferences)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(notificationPreferences.userId, userId));
    } else {
      await db.insert(notificationPreferences).values({
        userId,
        ...updates,
        updatedAt: new Date(),
      });
    }

    logger.info("[Notifications] Preferences updated", { userId });
    res.json({ success: true });
  } catch (error) {
    logger.error("[Notifications] Failed to update preferences", { error, userId });
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

// ============================================================================
// GET /api/notifications/unread-count — Get unread notification count
// ============================================================================

router.get("/unread-count", async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const userId = req.currentUser!.id;

  try {
    const db = getDb();
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    res.json({ count: result?.count ?? 0 });
  } catch (error) {
    logger.error("[Notifications] Failed to get unread count", { error, userId });
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

// ============================================================================
// GET /api/notifications — List notifications (paginated)
// ============================================================================

router.get("/", async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const userId = req.currentUser!.id;
  const limit = Math.min(parseInt(String(req.query.limit)) || 20, 50);
  const offset = parseInt(String(req.query.offset)) || 0;

  try {
    const db = getDb();
    const items = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.userId, userId));

    res.json({
      notifications: items,
      total: countResult?.total ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("[Notifications] Failed to list notifications", { error, userId });
    res.status(500).json({ error: "Failed to list notifications" });
  }
});

// ============================================================================
// POST /api/notifications/:id/read — Mark a single notification as read
// ============================================================================

router.post("/:id/read", async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const userId = req.currentUser!.id;
  const notificationId = parseInt(req.params.id, 10);

  if (isNaN(notificationId)) {
    return res.status(400).json({ error: "Invalid notification ID" });
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error("[Notifications] Failed to mark as read", { error, userId, notificationId });
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// ============================================================================
// POST /api/notifications/read-all — Mark all notifications as read
// ============================================================================

router.post("/read-all", async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const userId = req.currentUser!.id;

  try {
    const db = getDb();
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    res.json({ success: true });
  } catch (error) {
    logger.error("[Notifications] Failed to mark all as read", { error, userId });
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

export { router as notificationsRouter };
