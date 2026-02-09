/**
 * Game Notification Service
 *
 * Sends push notifications for S.K.A.T.E. game events.
 * No soft language. Direct. Final.
 */

import { sendPushNotification } from "./notificationService";
import logger from "../logger";

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
}

const NOTIFICATION_CONFIG: Record<
  GameNotificationType,
  (data: NotificationData) => { title: string; body: string }
> = {
  challenge_received: (data) => ({
    title: "New Challenge",
    body: `${data.challengerName || "Someone"} challenged you to S.K.A.T.E.`,
  }),
  your_turn: (data) => ({
    title: "Your turn.",
    body: `${data.opponentName || "Opponent"} is waiting.`,
  }),
  game_over: (data) => ({
    title: data.youWon ? "You won." : "You lost.",
    body: data.youWon ? "S.K.A.T.E. game complete." : "S.K.A.T.E.",
  }),
  opponent_forfeited: () => ({
    title: "Opponent forfeited.",
    body: "You win by forfeit.",
  }),
  game_forfeited_timeout: () => ({
    title: "Game over. Timeout.",
    body: "Deadline missed. Game forfeited.",
  }),
  deadline_warning: (data) => ({
    title: "Time running out.",
    body: `${data.minutesRemaining || 60} minutes left to respond.`,
  }),
  dispute_filed: () => ({
    title: "Dispute filed.",
    body: "Your opponent is disputing your call. Respond now.",
  }),
};

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
