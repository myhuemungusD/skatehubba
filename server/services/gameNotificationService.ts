/**
 * Game Notification Service
 *
 * Sends push notifications for S.K.A.T.E. game events.
 * Uses the unified notifyUser to deliver across push, email, and in-app.
 * No soft language. Direct. Final.
 */

import { sendPushNotification, notifyUser } from "./notificationService";
import logger from "../logger";
import type { NotificationType } from "@shared/schema";

type GameNotificationType =
  | "challenge_received"
  | "your_turn"
  | "game_over"
  | "opponent_forfeited"
  | "game_forfeited_timeout"
  | "deadline_warning"
  | "dispute_filed";

interface NotificationData {
  gameId: string;
  challengerName?: string;
  opponentName?: string;
  winnerId?: string;
  youWon?: boolean;
  loserId?: string;
  disputeId?: number;
  minutesRemaining?: number;
  trickName?: string;
}

const NOTIFICATION_CONFIG: Record<
  GameNotificationType,
  (data: NotificationData) => { title: string; body: string }
> = {
  challenge_received: (data) => ({
    title: "New S.K.A.T.E. Challenge",
    body: `@${data.challengerName || "Someone"} challenged you to S.K.A.T.E. — accept or decline.`,
  }),
  your_turn: (data) => ({
    title: "Your move.",
    body: data.trickName
      ? `@${data.opponentName || "Opponent"} set a ${data.trickName} — your move`
      : `@${data.opponentName || "Opponent"} is waiting — your move`,
  }),
  game_over: (data) => ({
    title: data.youWon ? "VICTORY" : "S.K.A.T.E.",
    body: data.youWon
      ? `You beat ${data.opponentName || "your opponent"}. Game complete.`
      : `${data.opponentName || "Your opponent"} won. You have S.K.A.T.E.`,
  }),
  opponent_forfeited: (data) => ({
    title: "Opponent forfeited.",
    body: `${data.opponentName || "Your opponent"} gave up. You win.`,
  }),
  game_forfeited_timeout: () => ({
    title: "Game over. Timeout.",
    body: "24hr deadline missed. Letter assigned.",
  }),
  deadline_warning: (data) => ({
    title: "Clock's ticking.",
    body: `${data.minutesRemaining || 60} minutes left to respond. Miss it and you take the letter.`,
  }),
  dispute_filed: () => ({
    title: "Dispute filed.",
    body: "Your opponent is disputing your call. Respond now.",
  }),
};

/**
 * Send game notification via push only (legacy — used when userId is unknown).
 * Prefer sendGameNotificationToUser when you have the userId.
 */
export async function sendGameNotification(
  pushToken: string,
  type: GameNotificationType,
  data: NotificationData
): Promise<void> {
  try {
    const config = NOTIFICATION_CONFIG[type];
    const { title, body } = config(data);

    await sendPushNotification({
      to: pushToken,
      title,
      body,
      data: {
        type: `game_${type}`,
        gameId: data.gameId,
        ...(data.disputeId ? { disputeId: String(data.disputeId) } : {}),
      },
      sound: "default",
      channelId: "game",
    });
  } catch (error) {
    logger.error("[GameNotification] Failed to send", { error, type, data });
  }
}

/**
 * Send game notification via unified notifyUser (push + email + in-app).
 * This is the preferred method when you have the userId.
 */
export async function sendGameNotificationToUser(
  userId: string,
  type: GameNotificationType,
  data: NotificationData
): Promise<void> {
  try {
    const config = NOTIFICATION_CONFIG[type];
    const { title, body } = config(data);

    await notifyUser({
      userId,
      type: type as NotificationType,
      title,
      body,
      data: {
        gameId: data.gameId,
        opponentName: data.opponentName,
        challengerName: data.challengerName,
        youWon: data.youWon,
        ...(data.disputeId ? { disputeId: data.disputeId } : {}),
      },
    });
  } catch (error) {
    logger.error("[GameNotification] Failed to send to user", { error, type, userId });
  }
}
