/**
 * Notification Service
 *
 * Handles sending push notifications to users via Expo Push Notification service.
 * Also persists in-app notifications and respects user preferences.
 */

import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import logger from "../logger";
import { getDb } from "../db";
import {
  notifications,
  notificationPreferences,
  customUsers,
  type NotificationType,
  type NotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  shouldSendForType,
  isWithinQuietHours,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendGameEventEmail } from "./emailService";

// Create Expo SDK client
const expo = new Expo();

export interface PushNotificationPayload {
  to: string; // Expo push token
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

/**
 * Send a push notification to a single user
 */
export async function sendPushNotification(
  payload: PushNotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if the push token is valid
    if (!Expo.isExpoPushToken(payload.to)) {
      logger.warn("[Notification] Invalid Expo push token", { token: payload.to });
      return { success: false, error: "Invalid push token" };
    }

    // Construct push message
    const message: ExpoPushMessage = {
      to: payload.to,
      sound: payload.sound ?? "default",
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      badge: payload.badge,
      channelId: payload.channelId || "default",
    };

    // Send notification
    const tickets = await expo.sendPushNotificationsAsync([message]);
    const ticket = tickets[0] as ExpoPushTicket;

    if (ticket.status === "error") {
      logger.error("[Notification] Push notification failed", {
        error: ticket.message,
        details: ticket.details,
      });
      return { success: false, error: ticket.message };
    }

    logger.info("[Notification] Push notification sent", {
      to: payload.to,
      title: payload.title,
    });

    return { success: true };
  } catch (error) {
    logger.error("[Notification] Failed to send push notification", { error });
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Send challenge notification
 */
export async function sendChallengeNotification(
  pushToken: string,
  challengerName: string,
  challengeId: string
): Promise<void> {
  await sendPushNotification({
    to: pushToken,
    title: "New Challenge!",
    body: `${challengerName} challenged you to a S.K.A.T.E. battle!`,
    data: {
      type: "challenge",
      challengeId,
    },
    sound: "default",
  });
}

/**
 * Send quick match notification
 */
export async function sendQuickMatchNotification(
  pushToken: string,
  matcherName: string,
  challengeId: string
): Promise<void> {
  await sendPushNotification({
    to: pushToken,
    title: "Quick Match Found!",
    body: `${matcherName} wants to battle! Accept the challenge now.`,
    data: {
      type: "quick_match",
      challengeId,
    },
    sound: "default",
  });
}

// ============================================================================
// User preference helpers
// ============================================================================

async function getUserPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const db = getDb();
    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (!prefs) return DEFAULT_NOTIFICATION_PREFS;
    return {
      pushEnabled: prefs.pushEnabled,
      emailEnabled: prefs.emailEnabled,
      inAppEnabled: prefs.inAppEnabled,
      gameNotifications: prefs.gameNotifications,
      challengeNotifications: prefs.challengeNotifications,
      turnNotifications: prefs.turnNotifications,
      resultNotifications: prefs.resultNotifications,
      marketingEmails: prefs.marketingEmails,
      weeklyDigest: prefs.weeklyDigest,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

// ============================================================================
// Unified notification dispatch
// ============================================================================

/**
 * Send a notification to a user across all enabled channels (push, email, in-app).
 * Respects user notification preferences.
 */
export async function notifyUser(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { userId, type, title, body, data } = params;

  try {
    const prefs = await getUserPrefs(userId);

    if (!shouldSendForType(prefs, type)) {
      logger.debug("[Notification] Skipped — user opted out", { userId, type });
      return;
    }

    const inQuietHours = isWithinQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd);

    // 1. Persist in-app notification (always, even during quiet hours)
    if (prefs.inAppEnabled) {
      await persistNotification(userId, type, title, body, data);
    }

    // 2. Send push notification (suppressed during quiet hours)
    if (prefs.pushEnabled && !inQuietHours) {
      await sendPushToUser(userId, title, body, data);
    }

    // 3. Send email for high-value notifications (suppressed during quiet hours)
    if (prefs.emailEnabled && shouldEmailForType(type) && !inQuietHours) {
      await sendEmailToUser(userId, type, title, data);
    }

    if (inQuietHours) {
      logger.debug("[Notification] Quiet hours active — push/email suppressed", { userId, type });
    }
  } catch (error) {
    // Non-blocking: log and continue
    logger.error("[Notification] notifyUser failed", { error, userId, type });
  }
}

function shouldEmailForType(type: NotificationType): boolean {
  // Only email for high-value events that need re-engagement
  return ["challenge_received", "your_turn", "game_over"].includes(type);
}

async function persistNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(notifications).values({
      userId,
      type,
      title,
      body,
      data: data ?? {},
      channel: "in_app",
      isRead: false,
    });
  } catch (error) {
    logger.error("[Notification] Failed to persist notification", { error, userId });
  }
}

async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const db = getDb();
    const [user] = await db
      .select({ pushToken: customUsers.pushToken })
      .from(customUsers)
      .where(eq(customUsers.id, userId))
      .limit(1);

    if (user?.pushToken) {
      await sendPushNotification({
        to: user.pushToken,
        title,
        body,
        data: data as Record<string, unknown>,
        sound: "default",
      });
    }
  } catch (error) {
    logger.error("[Notification] Failed to send push to user", { error, userId });
  }
}

async function sendEmailToUser(
  userId: string,
  type: NotificationType,
  _title: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const db = getDb();
    const [user] = await db
      .select({
        email: customUsers.email,
        firstName: customUsers.firstName,
      })
      .from(customUsers)
      .where(eq(customUsers.id, userId))
      .limit(1);

    if (!user?.email) return;

    const name = user.firstName || "Skater";
    const gameId = (data?.gameId as string) || "";
    const opponentName = data?.opponentName as string | undefined;
    const won = data?.youWon as boolean | undefined;

    if (type === "challenge_received" || type === "your_turn" || type === "game_over") {
      await sendGameEventEmail(user.email, name, {
        type,
        opponentName,
        gameId,
        won,
      });
    }
  } catch (error) {
    logger.error("[Notification] Failed to send email to user", { error, userId });
  }
}
