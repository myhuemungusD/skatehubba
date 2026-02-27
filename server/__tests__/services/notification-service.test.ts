/**
 * @fileoverview Unit tests for Notification Service
 *
 * Tests:
 * - sendPushNotification: invalid token, success, error ticket, exception
 * - sendChallengeNotification: constructs correct payload
 * - sendQuickMatchNotification: constructs correct payload
 * - notifyUser: respects preferences (push/email/inApp), skips for opted-out types
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

const mockSendPushNotificationsAsync = vi.fn();
const mockIsExpoPushToken = vi.fn();

vi.mock("expo-server-sdk", () => ({
  Expo: class MockExpo {
    static isExpoPushToken = mockIsExpoPushToken;
    sendPushNotificationsAsync = mockSendPushNotificationsAsync;
  },
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

const mockGetDb = vi.fn();

vi.mock("../../db", () => ({
  getDb: () => mockGetDb(),
}));

vi.mock("@shared/schema", () => {
  const GAME_TYPES = new Set([
    "challenge_received",
    "your_turn",
    "game_over",
    "opponent_forfeited",
    "game_forfeited_timeout",
    "deadline_warning",
    "dispute_filed",
    "quick_match",
  ]);
  const CHALLENGE_TYPES = new Set(["challenge_received", "quick_match"]);
  const TURN_TYPES = new Set(["your_turn", "deadline_warning"]);
  const RESULT_TYPES = new Set(["game_over", "opponent_forfeited", "game_forfeited_timeout"]);

  return {
    notifications: { _table: "notifications" },
    notificationPreferences: {
      _table: "notificationPreferences",
      userId: { name: "userId" },
    },
    customUsers: {
      _table: "customUsers",
      id: { name: "id" },
      pushToken: { name: "pushToken" },
      email: { name: "email" },
      firstName: { name: "firstName" },
    },
    DEFAULT_NOTIFICATION_PREFS: {
      pushEnabled: true,
      emailEnabled: true,
      inAppEnabled: true,
      gameNotifications: true,
      challengeNotifications: true,
      turnNotifications: true,
      resultNotifications: true,
      marketingEmails: true,
      weeklyDigest: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    },
    shouldSendForType: (
      prefs: {
        gameNotifications: boolean;
        challengeNotifications: boolean;
        turnNotifications: boolean;
        resultNotifications: boolean;
      },
      type: string
    ) => {
      if (GAME_TYPES.has(type) && !prefs.gameNotifications) return false;
      if (CHALLENGE_TYPES.has(type) && !prefs.challengeNotifications) return false;
      if (TURN_TYPES.has(type) && !prefs.turnNotifications) return false;
      if (RESULT_TYPES.has(type) && !prefs.resultNotifications) return false;
      return true;
    },
    isWithinQuietHours: (start: string | null, end: string | null) => {
      // In tests, quiet hours are "active" when both values are set to non-null
      if (!start || !end) return false;
      return true;
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

const mockSendGameEventEmail = vi.fn();

vi.mock("./emailService", () => ({
  sendGameEventEmail: mockSendGameEventEmail,
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const { sendPushNotification, sendChallengeNotification, sendQuickMatchNotification, notifyUser } =
  await import("../../services/notificationService");

const logger = (await import("../../logger")).default;

// ============================================================================
// Tests
// ============================================================================

describe("Notification Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
    mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);
    mockGetDb.mockImplementation(() => {
      throw new Error("Database not configured");
    });
  });

  // ==========================================================================
  // sendPushNotification
  // ==========================================================================

  describe("sendPushNotification", () => {
    it("returns error for invalid push token", async () => {
      mockIsExpoPushToken.mockReturnValue(false);

      const result = await sendPushNotification({
        to: "invalid-token",
        title: "Test",
        body: "Test body",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid push token");
      expect(logger.warn).toHaveBeenCalledWith(
        "[Notification] Invalid Expo push token",
        expect.objectContaining({ token: "invalid-token" })
      );
    });

    it("sends notification successfully", async () => {
      const result = await sendPushNotification({
        to: "ExponentPushToken[abc123]",
        title: "Hello",
        body: "World",
        data: { type: "test" },
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          to: "ExponentPushToken[abc123]",
          title: "Hello",
          body: "World",
          sound: "default",
          data: { type: "test" },
          channelId: "default",
        }),
      ]);
      expect(logger.info).toHaveBeenCalledWith(
        "[Notification] Push notification sent",
        expect.objectContaining({ to: "ExponentPushToken[abc123]", title: "Hello" })
      );
    });

    it("returns error when ticket has error status", async () => {
      mockSendPushNotificationsAsync.mockResolvedValue([
        {
          status: "error",
          message: "DeviceNotRegistered",
          details: { error: "DeviceNotRegistered" },
        },
      ]);

      const result = await sendPushNotification({
        to: "ExponentPushToken[abc123]",
        title: "Test",
        body: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("DeviceNotRegistered");
      expect(logger.error).toHaveBeenCalledWith(
        "[Notification] Push notification failed",
        expect.objectContaining({ error: "DeviceNotRegistered" })
      );
    });

    it("handles exception during send", async () => {
      mockSendPushNotificationsAsync.mockRejectedValue(new Error("Network timeout"));

      const result = await sendPushNotification({
        to: "ExponentPushToken[abc123]",
        title: "Test",
        body: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network timeout");
      expect(logger.error).toHaveBeenCalledWith(
        "[Notification] Failed to send push notification",
        expect.any(Object)
      );
    });

    it("uses default sound and channel when not specified", async () => {
      await sendPushNotification({
        to: "ExponentPushToken[abc123]",
        title: "Test",
        body: "Test",
      });

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          sound: "default",
          channelId: "default",
        }),
      ]);
    });

    it("passes custom sound and channel", async () => {
      await sendPushNotification({
        to: "ExponentPushToken[abc123]",
        title: "Test",
        body: "Test",
        sound: null,
        channelId: "games",
      });

      // sound: null gets coalesced to "default" by the ?? operator
      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          sound: "default",
          channelId: "games",
        }),
      ]);
    });
  });

  // ==========================================================================
  // sendChallengeNotification
  // ==========================================================================

  describe("sendChallengeNotification", () => {
    it("sends challenge notification with correct payload", async () => {
      await sendChallengeNotification("ExponentPushToken[abc]", "Tony Hawk", "challenge-1");

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          to: "ExponentPushToken[abc]",
          title: "New Challenge!",
          body: "Tony Hawk challenged you to a S.K.A.T.E. battle!",
          data: { type: "challenge", challengeId: "challenge-1" },
          sound: "default",
        }),
      ]);
    });
  });

  // ==========================================================================
  // sendQuickMatchNotification
  // ==========================================================================

  describe("sendQuickMatchNotification", () => {
    it("sends quick match notification with correct payload", async () => {
      await sendQuickMatchNotification("ExponentPushToken[xyz]", "Nyjah Huston", "match-1");

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          to: "ExponentPushToken[xyz]",
          title: "Quick Match Found!",
          body: "Nyjah Huston wants to battle! Accept the challenge now.",
          data: { type: "quick_match", challengeId: "match-1" },
          sound: "default",
        }),
      ]);
    });
  });

  // ==========================================================================
  // notifyUser
  // ==========================================================================

  describe("notifyUser", () => {
    it("skips notification when user has opted out of game notifications", async () => {
      // Database returns prefs with gameNotifications = false
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            pushEnabled: true,
            emailEnabled: true,
            inAppEnabled: true,
            gameNotifications: false,
            challengeNotifications: true,
            turnNotifications: true,
            resultNotifications: true,
          },
        ]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      mockGetDb.mockReturnValue(mockDb);

      await notifyUser({
        userId: "user-1",
        type: "your_turn",
        title: "Your Turn",
        body: "It's your turn!",
      });

      expect(logger.debug).toHaveBeenCalledWith(
        "[Notification] Skipped — user opted out",
        expect.objectContaining({ userId: "user-1", type: "your_turn" })
      );
      expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
    });

    it("uses default preferences when database is unavailable", async () => {
      mockGetDb.mockImplementation(() => {
        throw new Error("Database not configured");
      });

      // notifyUser should proceed with default prefs (all enabled)
      // But push/email sub-functions also check getDb, so they'll no-op
      await notifyUser({
        userId: "user-2",
        type: "challenge_received",
        title: "Challenge",
        body: "You got challenged!",
      });

      // Should not have skipped due to preferences
      expect(logger.debug).not.toHaveBeenCalledWith(
        "[Notification] Skipped — user opted out",
        expect.any(Object)
      );
    });

    it("handles errors gracefully without throwing", async () => {
      mockGetDb.mockImplementation(() => {
        throw new Error("DB exploded");
      });

      // Should not throw
      await notifyUser({
        userId: "user-3",
        type: "game_over",
        title: "Game Over",
        body: "The game is over.",
      });

      // Errors are caught at the inner function level (persist/push/email)
      expect(logger.error).toHaveBeenCalled();
    });

    it("skips when challenge notifications are disabled", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            pushEnabled: true,
            emailEnabled: true,
            inAppEnabled: true,
            gameNotifications: true,
            challengeNotifications: false,
            turnNotifications: true,
            resultNotifications: true,
          },
        ]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      mockGetDb.mockReturnValue(mockDb);

      await notifyUser({
        userId: "user-4",
        type: "challenge_received",
        title: "New Challenge",
        body: "You got challenged!",
      });

      expect(logger.debug).toHaveBeenCalledWith(
        "[Notification] Skipped — user opted out",
        expect.objectContaining({ userId: "user-4", type: "challenge_received" })
      );
    });

    it("skips when result notifications are disabled for game_over", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            pushEnabled: true,
            emailEnabled: true,
            inAppEnabled: true,
            gameNotifications: true,
            challengeNotifications: true,
            turnNotifications: true,
            resultNotifications: false,
          },
        ]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      mockGetDb.mockReturnValue(mockDb);

      await notifyUser({
        userId: "user-5",
        type: "game_over",
        title: "Game Over",
        body: "The game is over.",
      });

      expect(logger.debug).toHaveBeenCalledWith(
        "[Notification] Skipped — user opted out",
        expect.objectContaining({ type: "game_over" })
      );
    });

    it("suppresses push and email during quiet hours but still persists in-app", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            pushEnabled: true,
            emailEnabled: true,
            inAppEnabled: true,
            gameNotifications: true,
            challengeNotifications: true,
            turnNotifications: true,
            resultNotifications: true,
            // Non-null values trigger isWithinQuietHours mock to return true
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
          },
        ]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      mockGetDb.mockReturnValue(mockDb);

      await notifyUser({
        userId: "user-quiet",
        type: "challenge_received",
        title: "New Challenge",
        body: "You got challenged!",
      });

      // Should NOT have been skipped by shouldSendForType
      expect(logger.debug).not.toHaveBeenCalledWith(
        "[Notification] Skipped — user opted out",
        expect.any(Object)
      );

      // In-app notification should still be persisted (insert called)
      expect(mockDb.insert).toHaveBeenCalled();

      // Push should be suppressed — sendPushNotificationsAsync should NOT be called
      expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();

      // Quiet hours suppression should be logged
      expect(logger.debug).toHaveBeenCalledWith(
        "[Notification] Quiet hours active — push/email suppressed",
        expect.objectContaining({ userId: "user-quiet", type: "challenge_received" })
      );
    });
  });
});
