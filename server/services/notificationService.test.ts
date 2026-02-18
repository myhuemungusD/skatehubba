import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mocks referenced inside vi.mock factories
const {
  mockSendPush,
  mockIsExpoPushToken,
  mockGetDb,
  mockIsDatabaseAvailable,
  mockSendGameEventEmail,
} = vi.hoisted(() => ({
  mockSendPush: vi.fn(),
  mockIsExpoPushToken: vi.fn(),
  mockGetDb: vi.fn(),
  mockIsDatabaseAvailable: vi.fn(),
  mockSendGameEventEmail: vi.fn(),
}));

vi.mock("expo-server-sdk", () => ({
  Expo: class MockExpo {
    sendPushNotificationsAsync = mockSendPush;
    static isExpoPushToken = mockIsExpoPushToken;
  },
}));

vi.mock("../logger", () => ({
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

vi.mock("../db", () => ({
  getDb: () => mockGetDb(),
  isDatabaseAvailable: () => mockIsDatabaseAvailable(),
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
    notificationPreferences: { _table: "notificationPreferences", userId: { name: "userId" } },
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
      if (!start || !end) return false;
      return true;
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

vi.mock("./emailService", () => ({
  sendGameEventEmail: mockSendGameEventEmail,
}));

import {
  sendPushNotification,
  sendChallengeNotification,
  sendQuickMatchNotification,
  notifyUser,
} from "./notificationService";
import logger from "../logger";

describe("sendPushNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
  });

  it("returns error for invalid push token", async () => {
    mockIsExpoPushToken.mockReturnValue(false);
    const result = await sendPushNotification({
      to: "invalid-token",
      title: "Test",
      body: "Test body",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid push token");
    expect(logger.warn).toHaveBeenCalled();
  });

  it("sends notification successfully", async () => {
    mockSendPush.mockResolvedValue([{ status: "ok" }]);
    const result = await sendPushNotification({
      to: "ExponentPushToken[xxxx]",
      title: "Test",
      body: "Test body",
    });
    expect(result.success).toBe(true);
    expect(mockSendPush).toHaveBeenCalledWith([
      expect.objectContaining({
        to: "ExponentPushToken[xxxx]",
        title: "Test",
        body: "Test body",
      }),
    ]);
  });

  it("handles push notification error status", async () => {
    mockSendPush.mockResolvedValue([
      { status: "error", message: "DeviceNotRegistered", details: {} },
    ]);
    const result = await sendPushNotification({
      to: "ExponentPushToken[xxxx]",
      title: "Test",
      body: "Test body",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("DeviceNotRegistered");
  });

  it("handles SDK exceptions", async () => {
    mockSendPush.mockRejectedValue(new Error("Network error"));
    const result = await sendPushNotification({
      to: "ExponentPushToken[xxxx]",
      title: "Test",
      body: "Test body",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });

  it("uses default sound and channel", async () => {
    mockSendPush.mockResolvedValue([{ status: "ok" }]);
    await sendPushNotification({
      to: "ExponentPushToken[xxxx]",
      title: "Test",
      body: "Body",
    });
    const message = mockSendPush.mock.calls[0][0][0];
    expect(message.sound).toBe("default");
    expect(message.channelId).toBe("default");
  });

  it("respects custom channel", async () => {
    mockSendPush.mockResolvedValue([{ status: "ok" }]);
    await sendPushNotification({
      to: "ExponentPushToken[xxxx]",
      title: "Test",
      body: "Body",
      channelId: "urgent",
    });
    const message = mockSendPush.mock.calls[0][0][0];
    expect(message.channelId).toBe("urgent");
  });

  it("defaults sound to 'default' when null", async () => {
    mockSendPush.mockResolvedValue([{ status: "ok" }]);
    await sendPushNotification({
      to: "ExponentPushToken[xxxx]",
      title: "Test",
      body: "Body",
      sound: null,
    });
    const message = mockSendPush.mock.calls[0][0][0];
    // null ?? "default" = "default" per source code
    expect(message.sound).toBe("default");
  });
});

describe("sendChallengeNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
    mockSendPush.mockResolvedValue([{ status: "ok" }]);
  });

  it("sends challenge notification with correct content", async () => {
    await sendChallengeNotification("ExponentPushToken[xxxx]", "Tony", "challenge1");
    const message = mockSendPush.mock.calls[0][0][0];
    expect(message.body).toContain("Tony");
    expect(message.body).toContain("S.K.A.T.E.");
    expect(message.data.type).toBe("challenge");
    expect(message.data.challengeId).toBe("challenge1");
  });
});

describe("sendQuickMatchNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
    mockSendPush.mockResolvedValue([{ status: "ok" }]);
  });

  it("sends quick match notification with correct content", async () => {
    await sendQuickMatchNotification("ExponentPushToken[xxxx]", "Bob", "match1");
    const message = mockSendPush.mock.calls[0][0][0];
    expect(message.body).toContain("Bob");
    expect(message.data.type).toBe("quick_match");
    expect(message.data.challengeId).toBe("match1");
  });
});

// ==========================================================================
// notifyUser — coverage for uncovered lines 250, 282-284, 290
// ==========================================================================

describe("notifyUser - uncovered paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
    mockSendPush.mockResolvedValue([{ status: "ok" }]);
    mockIsDatabaseAvailable.mockReturnValue(true);
  });

  /**
   * Line 250: sendPushToUser when user has no pushToken
   * The code at line 249 checks `if (user?.pushToken)` — when user exists but
   * pushToken is null/undefined, the push send is skipped silently.
   */
  it("skips push notification when user has no pushToken (line 250)", async () => {
    // getUserPrefs returns default (all enabled)
    const mockDbPrefs = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    // First call: getUserPrefs (returns no prefs -> defaults)
    // Second call: persistNotification insert
    // Third call: sendPushToUser select (returns user with no pushToken)
    // Fourth call: sendEmailToUser select
    let selectCallCount = 0;
    mockDbPrefs.limit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // getUserPrefs - return empty for defaults
        return Promise.resolve([]);
      }
      if (selectCallCount === 2) {
        // sendPushToUser - user WITHOUT pushToken
        return Promise.resolve([{ pushToken: null }]);
      }
      if (selectCallCount === 3) {
        // sendEmailToUser - user with email
        return Promise.resolve([{ email: "test@example.com", firstName: "Tony" }]);
      }
      return Promise.resolve([]);
    });

    mockGetDb.mockReturnValue(mockDbPrefs);

    await notifyUser({
      userId: "user-no-push",
      type: "challenge_received",
      title: "New Challenge",
      body: "Someone challenged you!",
      data: { gameId: "game-1", opponentName: "Rival" },
    });

    // Push was NOT sent (no pushToken)
    expect(mockSendPush).not.toHaveBeenCalled();
    // Email WAS sent since user has email and type is challenge_received
    expect(mockSendGameEventEmail).toHaveBeenCalled();
  });

  /**
   * Lines 282-284: sendEmailToUser returns early when user has no email
   */
  it("skips email when user has no email address (lines 282-284)", async () => {
    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // getUserPrefs - return empty (defaults)
          return Promise.resolve([]);
        }
        if (selectCallCount === 2) {
          // sendPushToUser - no push token
          return Promise.resolve([{ pushToken: null }]);
        }
        if (selectCallCount === 3) {
          // sendEmailToUser - user WITHOUT email
          return Promise.resolve([{ email: null, firstName: "NoEmail" }]);
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);

    await notifyUser({
      userId: "user-no-email",
      type: "your_turn",
      title: "Your Turn",
      body: "Play your turn",
      data: { gameId: "game-2" },
    });

    // sendGameEventEmail should NOT have been called since email is null
    expect(mockSendGameEventEmail).not.toHaveBeenCalled();
  });

  /**
   * Line 284/290: firstName fallback to "Skater" when user.firstName is falsy
   */
  it("uses 'Skater' as firstName fallback when user.firstName is null (line 284/290)", async () => {
    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // getUserPrefs - return empty (defaults)
          return Promise.resolve([]);
        }
        if (selectCallCount === 2) {
          // sendPushToUser - no push token
          return Promise.resolve([{ pushToken: null }]);
        }
        if (selectCallCount === 3) {
          // sendEmailToUser - user with email but NO firstName
          return Promise.resolve([{ email: "user@example.com", firstName: null }]);
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);
    mockSendGameEventEmail.mockResolvedValue({ success: true });

    await notifyUser({
      userId: "user-no-name",
      type: "game_over",
      title: "Game Over",
      body: "The game ended",
      data: { gameId: "game-3", youWon: true },
    });

    // sendGameEventEmail called with "Skater" as the name fallback
    expect(mockSendGameEventEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Skater",
      expect.objectContaining({ type: "game_over", gameId: "game-3" })
    );
  });
});
