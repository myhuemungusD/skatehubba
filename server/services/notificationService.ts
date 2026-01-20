/**
 * Notification Service
 *
 * Handles sending push notifications to users via Expo Push Notification service
 * Used for quick match notifications, challenge notifications, etc.
 */

import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import logger from "../logger";

// Create Expo SDK client
const expo = new Expo();

export interface PushNotificationPayload {
  to: string; // Expo push token
  title: string;
  body: string;
  data?: Record<string, any>;
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
    title: "🔥 New Challenge!",
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
    title: "⚡ Quick Match Found!",
    body: `${matcherName} wants to battle! Accept the challenge now.`,
    data: {
      type: "quick_match",
      challengeId,
    },
    sound: "default",
  });
}
