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
import { getDb } from "../db";
import { authenticateUser } from "../auth/middleware";
import {
  customUsers,
  deviceTokens,
  notifications,
  notificationPreferences,
  DEFAULT_NOTIFICATION_PREFS,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import logger from "../logger";
import { asyncHandler } from "../utils/asyncHandler";
import { Errors } from "../utils/apiError";

const router = Router();

const paginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((v) => Math.min(v, 50)),
  offset: z.coerce.number().int().min(0).default(0),
});

// All notification routes require auth
router.use(authenticateUser);

// ============================================================================
// POST /api/notifications/push-token — Register/update push token
// ============================================================================

const pushTokenSchema = z.object({
  token: z.string().min(1).max(500),
  platform: z.enum(["ios", "android", "web"]).optional().default("android"),
  deviceName: z.string().max(100).optional(),
});

router.post(
  "/push-token",
  asyncHandler(async (req, res) => {
    const parsed = pushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return Errors.validation(res, parsed.error.flatten());
    }

    const userId = req.currentUser!.id;
    const { token, platform, deviceName } = parsed.data;

    try {
      const db = getDb();

      // Upsert into deviceTokens for multi-device support
      await db
        .insert(deviceTokens)
        .values({
          userId,
          token,
          platform,
          deviceName: deviceName ?? null,
          lastUsedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: deviceTokens.token,
          set: {
            userId,
            platform,
            deviceName: deviceName ?? null,
            lastUsedAt: new Date(),
          },
        });

      // Backward compat: also set on customUsers for legacy code paths
      await db
        .update(customUsers)
        .set({ pushToken: token, updatedAt: new Date() })
        .where(eq(customUsers.id, userId));

      logger.info("[Notifications] Push token registered", { userId, platform });
      res.json({ success: true });
    } catch (error) {
      logger.error("[Notifications] Failed to register push token", { error, userId });
      return Errors.internal(res, "PUSH_TOKEN_FAILED", "Failed to register push token.");
    }
  })
);

// ============================================================================
// DELETE /api/notifications/push-token — Remove push token (on logout)
// ============================================================================

const deleteTokenSchema = z.object({
  token: z.string().min(1).max(500).optional(),
});

router.delete(
  "/push-token",
  asyncHandler(async (req, res) => {
    const userId = req.currentUser!.id;
    const parsed = deleteTokenSchema.safeParse(req.body);
    const specificToken = parsed.success ? parsed.data.token : undefined;

    try {
      const db = getDb();

      if (specificToken) {
        // Remove a specific device token
        await db
          .delete(deviceTokens)
          .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, specificToken)));
      } else {
        // Remove all device tokens for this user (full logout)
        await db.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
      }

      // Backward compat: clear legacy pushToken
      await db
        .update(customUsers)
        .set({ pushToken: null, updatedAt: new Date() })
        .where(eq(customUsers.id, userId));

      res.json({ success: true });
    } catch (error) {
      logger.error("[Notifications] Failed to remove push token", { error, userId });
      return Errors.internal(res, "PUSH_TOKEN_REMOVE_FAILED", "Failed to remove push token.");
    }
  })
);

// ============================================================================
// GET /api/notifications/preferences — Get notification preferences
// ============================================================================

router.get(
  "/preferences",
  asyncHandler(async (req, res) => {
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
      return Errors.internal(res, "PREFERENCES_FETCH_FAILED", "Failed to get preferences.");
    }
  })
);

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
  // M3: Validate actual HH:MM time format (not just \d{2}:\d{2} which accepts 99:99)
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be valid HH:MM (00:00-23:59)")
    .nullable()
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be valid HH:MM (00:00-23:59)")
    .nullable()
    .optional(),
});

router.put(
  "/preferences",
  asyncHandler(async (req, res) => {
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return Errors.validation(res, parsed.error.flatten());
    }

    const userId = req.currentUser!.id;
    const updates = parsed.data;

    try {
      const db = getDb();

      // Atomic upsert using ON CONFLICT to avoid TOCTOU race conditions
      // where concurrent requests could both see "no existing" and both try to insert.
      await db
        .insert(notificationPreferences)
        .values({
          userId,
          ...updates,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: { ...updates, updatedAt: new Date() },
        });

      logger.info("[Notifications] Preferences updated", { userId });
      res.json({ success: true });
    } catch (error) {
      logger.error("[Notifications] Failed to update preferences", { error, userId });
      return Errors.internal(res, "PREFERENCES_UPDATE_FAILED", "Failed to update preferences.");
    }
  })
);

// ============================================================================
// GET /api/notifications/unread-count — Get unread notification count
// ============================================================================

router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
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
      return Errors.internal(res, "UNREAD_COUNT_FAILED", "Failed to get unread count.");
    }
  })
);

// ============================================================================
// GET /api/notifications — List notifications (paginated)
// ============================================================================

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.currentUser!.id;
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return Errors.badRequest(res, "INVALID_PAGINATION", "Invalid pagination parameters.");
    }
    const { limit, offset } = parsed.data;

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
      return Errors.internal(res, "NOTIFICATIONS_FETCH_FAILED", "Failed to list notifications.");
    }
  })
);

// ============================================================================
// POST /api/notifications/:id/read — Mark a single notification as read
// ============================================================================

router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const userId = req.currentUser!.id;
    const notificationId = parseInt(req.params.id, 10);

    if (isNaN(notificationId)) {
      return Errors.badRequest(res, "INVALID_NOTIFICATION_ID", "Invalid notification ID.");
    }

    try {
      const db = getDb();
      const [updated] = await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
        .returning();

      if (!updated) {
        return Errors.notFound(res, "NOTIFICATION_NOT_FOUND", "Notification not found.");
      }

      res.json({ success: true });
    } catch (error) {
      logger.error("[Notifications] Failed to mark as read", { error, userId, notificationId });
      return Errors.internal(res, "MARK_READ_FAILED", "Failed to mark as read.");
    }
  })
);

// ============================================================================
// POST /api/notifications/read-all — Mark all notifications as read
// ============================================================================

router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
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
      return Errors.internal(res, "MARK_ALL_READ_FAILED", "Failed to mark all as read.");
    }
  })
);

export { router as notificationsRouter };
