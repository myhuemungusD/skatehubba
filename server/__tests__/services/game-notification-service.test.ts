/**
 * @fileoverview Unit tests for Game Notification Service
 *
 * Tests:
 * - sendGameNotification: each notification type produces correct title/body,
 *   includes disputeId when present, error handling (logs but doesn't throw)
 * - sendGameNotificationToUser: each notification type, passes correct data to notifyUser,
 *   error handling (logs but doesn't throw)
 * - game_over type: youWon=true and youWon=false branches
 * - deadline_warning: with and without minutesRemaining
 * - challenge_received: with and without challengerName
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

const mockSendPushNotification = vi.fn();
const mockNotifyUser = vi.fn();

vi.mock("../../services/notificationService", () => ({
  sendPushNotification: mockSendPushNotification,
  notifyUser: mockNotifyUser,
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const { sendGameNotification, sendGameNotificationToUser } =
  await import("../../services/gameNotificationService");

const logger = (await import("../../logger")).default;

// ============================================================================
// Tests
// ============================================================================

describe("Game Notification Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendPushNotification.mockResolvedValue({ success: true });
    mockNotifyUser.mockResolvedValue(undefined);
  });

  // ==========================================================================
  // sendGameNotification
  // ==========================================================================

  describe("sendGameNotification", () => {
    const pushToken = "ExponentPushToken[test123]";
    const baseData = { gameId: "game-1" };

    it("sends challenge_received notification with challengerName", async () => {
      await sendGameNotification(pushToken, "challenge_received", {
        ...baseData,
        challengerName: "Tony Hawk",
      });

      expect(mockSendPushNotification).toHaveBeenCalledWith({
        to: pushToken,
        title: "New Challenge",
        body: "Tony Hawk challenged you to S.K.A.T.E.",
        data: {
          type: "game_challenge_received",
          gameId: "game-1",
        },
        sound: "default",
        channelId: "game",
      });
    });

    it("sends challenge_received notification without challengerName", async () => {
      await sendGameNotification(pushToken, "challenge_received", baseData);

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New Challenge",
          body: "Someone challenged you to S.K.A.T.E.",
        })
      );
    });

    it("sends your_turn notification with opponentName", async () => {
      await sendGameNotification(pushToken, "your_turn", {
        ...baseData,
        opponentName: "Nyjah Huston",
      });

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Your turn.",
          body: "Nyjah Huston is waiting.",
          data: expect.objectContaining({
            type: "game_your_turn",
            gameId: "game-1",
          }),
        })
      );
    });

    it("sends your_turn notification without opponentName", async () => {
      await sendGameNotification(pushToken, "your_turn", baseData);

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Your turn.",
          body: "Opponent is waiting.",
        })
      );
    });

    it("sends game_over notification when youWon=true", async () => {
      await sendGameNotification(pushToken, "game_over", {
        ...baseData,
        youWon: true,
      });

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "You won.",
          body: "S.K.A.T.E. game complete.",
          data: expect.objectContaining({
            type: "game_game_over",
          }),
        })
      );
    });

    it("sends game_over notification when youWon=false", async () => {
      await sendGameNotification(pushToken, "game_over", {
        ...baseData,
        youWon: false,
      });

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "You lost.",
          body: "S.K.A.T.E.",
        })
      );
    });

    it("sends opponent_forfeited notification", async () => {
      await sendGameNotification(pushToken, "opponent_forfeited", baseData);

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Opponent forfeited.",
          body: "You win by forfeit.",
          data: expect.objectContaining({
            type: "game_opponent_forfeited",
          }),
        })
      );
    });

    it("sends game_forfeited_timeout notification", async () => {
      await sendGameNotification(pushToken, "game_forfeited_timeout", baseData);

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Game over. Timeout.",
          body: "Deadline missed. Game forfeited.",
          data: expect.objectContaining({
            type: "game_game_forfeited_timeout",
          }),
        })
      );
    });

    it("sends deadline_warning notification with minutesRemaining", async () => {
      await sendGameNotification(pushToken, "deadline_warning", {
        ...baseData,
        minutesRemaining: 15,
      });

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Time running out.",
          body: "15 minutes left to respond.",
        })
      );
    });

    it("sends deadline_warning notification without minutesRemaining (defaults to 60)", async () => {
      await sendGameNotification(pushToken, "deadline_warning", baseData);

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Time running out.",
          body: "60 minutes left to respond.",
        })
      );
    });

    it("sends dispute_filed notification with disputeId in data", async () => {
      await sendGameNotification(pushToken, "dispute_filed", {
        ...baseData,
        disputeId: 42,
      });

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Dispute filed.",
          body: "Your opponent is disputing your call. Respond now.",
          data: {
            type: "game_dispute_filed",
            gameId: "game-1",
            disputeId: "42",
          },
        })
      );
    });

    it("sends dispute_filed notification without disputeId", async () => {
      await sendGameNotification(pushToken, "dispute_filed", baseData);

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            type: "game_dispute_filed",
            gameId: "game-1",
          },
        })
      );
    });

    it("always uses sound 'default' and channelId 'game'", async () => {
      await sendGameNotification(pushToken, "your_turn", baseData);

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          sound: "default",
          channelId: "game",
        })
      );
    });

    it("logs error but does not throw when sendPushNotification rejects", async () => {
      mockSendPushNotification.mockRejectedValue(new Error("Network failure"));

      await expect(sendGameNotification(pushToken, "your_turn", baseData)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        "[GameNotification] Failed to send",
        expect.objectContaining({
          error: expect.any(Error),
          type: "your_turn",
          data: baseData,
        })
      );
    });
  });

  // ==========================================================================
  // sendGameNotificationToUser
  // ==========================================================================

  describe("sendGameNotificationToUser", () => {
    const userId = "user-abc";
    const baseData = { gameId: "game-2" };

    it("sends challenge_received notification with challengerName", async () => {
      await sendGameNotificationToUser(userId, "challenge_received", {
        ...baseData,
        challengerName: "Tony Hawk",
      });

      expect(mockNotifyUser).toHaveBeenCalledWith({
        userId,
        type: "challenge_received",
        title: "New Challenge",
        body: "Tony Hawk challenged you to S.K.A.T.E.",
        data: expect.objectContaining({
          gameId: "game-2",
          challengerName: "Tony Hawk",
        }),
      });
    });

    it("sends challenge_received notification without challengerName", async () => {
      await sendGameNotificationToUser(userId, "challenge_received", baseData);

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New Challenge",
          body: "Someone challenged you to S.K.A.T.E.",
        })
      );
    });

    it("sends your_turn notification", async () => {
      await sendGameNotificationToUser(userId, "your_turn", {
        ...baseData,
        opponentName: "Nyjah Huston",
      });

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: "your_turn",
          title: "Your turn.",
          body: "Nyjah Huston is waiting.",
          data: expect.objectContaining({
            gameId: "game-2",
            opponentName: "Nyjah Huston",
          }),
        })
      );
    });

    it("sends game_over notification when youWon=true", async () => {
      await sendGameNotificationToUser(userId, "game_over", {
        ...baseData,
        youWon: true,
      });

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "You won.",
          body: "S.K.A.T.E. game complete.",
          data: expect.objectContaining({
            youWon: true,
          }),
        })
      );
    });

    it("sends game_over notification when youWon=false", async () => {
      await sendGameNotificationToUser(userId, "game_over", {
        ...baseData,
        youWon: false,
      });

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "You lost.",
          body: "S.K.A.T.E.",
          data: expect.objectContaining({
            youWon: false,
          }),
        })
      );
    });

    it("sends opponent_forfeited notification", async () => {
      await sendGameNotificationToUser(userId, "opponent_forfeited", baseData);

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "opponent_forfeited",
          title: "Opponent forfeited.",
          body: "You win by forfeit.",
        })
      );
    });

    it("sends game_forfeited_timeout notification", async () => {
      await sendGameNotificationToUser(userId, "game_forfeited_timeout", baseData);

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "game_forfeited_timeout",
          title: "Game over. Timeout.",
          body: "Deadline missed. Game forfeited.",
        })
      );
    });

    it("sends deadline_warning notification with minutesRemaining", async () => {
      await sendGameNotificationToUser(userId, "deadline_warning", {
        ...baseData,
        minutesRemaining: 30,
      });

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Time running out.",
          body: "30 minutes left to respond.",
        })
      );
    });

    it("sends deadline_warning notification without minutesRemaining (defaults to 60)", async () => {
      await sendGameNotificationToUser(userId, "deadline_warning", baseData);

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Time running out.",
          body: "60 minutes left to respond.",
        })
      );
    });

    it("sends dispute_filed notification with disputeId in data", async () => {
      await sendGameNotificationToUser(userId, "dispute_filed", {
        ...baseData,
        disputeId: 99,
      });

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Dispute filed.",
          body: "Your opponent is disputing your call. Respond now.",
          data: expect.objectContaining({
            disputeId: 99,
          }),
        })
      );
    });

    it("sends dispute_filed notification without disputeId", async () => {
      await sendGameNotificationToUser(userId, "dispute_filed", baseData);

      const callArg = mockNotifyUser.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty("disputeId");
    });

    it("passes opponentName and challengerName through in data", async () => {
      await sendGameNotificationToUser(userId, "your_turn", {
        ...baseData,
        opponentName: "P-Rod",
        challengerName: "Leticia Bufoni",
      });

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gameId: "game-2",
            opponentName: "P-Rod",
            challengerName: "Leticia Bufoni",
          }),
        })
      );
    });

    it("logs error but does not throw when notifyUser rejects", async () => {
      mockNotifyUser.mockRejectedValue(new Error("Service unavailable"));

      await expect(
        sendGameNotificationToUser(userId, "game_over", baseData)
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        "[GameNotification] Failed to send to user",
        expect.objectContaining({
          error: expect.any(Error),
          type: "game_over",
          userId,
        })
      );
    });
  });
});
