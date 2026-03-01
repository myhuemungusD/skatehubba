import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mocks referenced inside vi.mock factories
const { mockSendPush, mockIsExpoPushToken, mockGetDb, mockSendGameEventEmail } = vi.hoisted(() => ({
  mockSendPush: vi.fn(),
  mockIsExpoPushToken: vi.fn(),
  mockGetDb: vi.fn(),
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

  it("returns 'Unknown error' when a non-Error is thrown", async () => {
    mockSendPush.mockRejectedValue("string error");
    const result = await sendPushNotification({
      to: "ExponentPushToken[xxxx]",
      title: "Test",
      body: "Test body",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown error");
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

  /**
   * persistNotification catch: when db.insert throws, the error is logged
   * but notifyUser does not throw.
   */
  it("logs error when persistNotification fails (line 232)", async () => {
    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // getUserPrefs - return empty (defaults, inAppEnabled = true)
          return Promise.resolve([]);
        }
        // sendPushToUser and sendEmailToUser
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockRejectedValue(new Error("Insert failed")),
    };

    mockGetDb.mockReturnValue(mockDb);

    // Should not throw even though persistNotification fails
    await notifyUser({
      userId: "user-persist-fail",
      type: "challenge_received",
      title: "Test",
      body: "Test body",
    });

    expect(logger.error).toHaveBeenCalledWith(
      "[Notification] Failed to persist notification",
      expect.objectContaining({ userId: "user-persist-fail" })
    );
  });

  /**
   * sendPushToUser catch: when db query for push token throws
   */
  it("logs error when sendPushToUser fails (lines 259-261)", async () => {
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
          // sendPushToUser - throws
          return Promise.reject(new Error("Push query failed"));
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);

    await notifyUser({
      userId: "user-push-fail",
      type: "challenge_received",
      title: "Test",
      body: "Test body",
    });

    expect(logger.error).toHaveBeenCalledWith(
      "[Notification] Failed to send push to user",
      expect.objectContaining({ userId: "user-push-fail" })
    );
  });

  /**
   * sendEmailToUser catch: when db query for email throws
   */
  it("logs error when sendEmailToUser fails (line 297)", async () => {
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
          // sendEmailToUser - throws
          return Promise.reject(new Error("Email query failed"));
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);

    await notifyUser({
      userId: "user-email-fail",
      type: "challenge_received",
      title: "Test",
      body: "Test body",
    });

    expect(logger.error).toHaveBeenCalledWith(
      "[Notification] Failed to send email to user",
      expect.objectContaining({ userId: "user-email-fail" })
    );
  });

  /**
   * getUserPrefs catch: when DB query throws, returns DEFAULT_NOTIFICATION_PREFS
   * (line 152-153 in getUserPrefs)
   */
  it("uses default prefs when getUserPrefs DB throws (line 152-153)", async () => {
    // First call to getDb (in getUserPrefs) throws, subsequent calls for
    // persistNotification/sendPushToUser/sendEmailToUser also fail but
    // are caught internally.
    mockGetDb.mockImplementation(() => {
      throw new Error("DB totally broken");
    });

    // Should not throw — getUserPrefs returns defaults on error
    await notifyUser({
      userId: "user-outer-fail",
      type: "challenge_received",
      title: "Test",
      body: "Test body",
    });

    // The fact that it didn't throw proves getUserPrefs returned defaults
    // The inner functions all log their own errors
    expect(logger.error).toHaveBeenCalled();
  });

  /**
   * notifyUser outer catch (line 204): triggered when isWithinQuietHours throws.
   * We can trigger this by importing the mocked module and temporarily overriding it.
   */
  it("catches and logs when notifyUser main body throws (line 204)", async () => {
    const schema = await import("@shared/schema");
    const originalIsWithinQuietHours = schema.isWithinQuietHours;

    // Temporarily make isWithinQuietHours throw
    (schema as any).isWithinQuietHours = () => {
      throw new Error("Unexpected quiet hours error");
    };

    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallCount++;
        // getUserPrefs returns empty -> defaults
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };
    mockGetDb.mockReturnValue(mockDb);

    await notifyUser({
      userId: "user-outer-catch",
      type: "challenge_received",
      title: "Test",
      body: "Test body",
    });

    expect(logger.error).toHaveBeenCalledWith(
      "[Notification] notifyUser failed",
      expect.objectContaining({ userId: "user-outer-catch" })
    );

    // Restore
    (schema as any).isWithinQuietHours = originalIsWithinQuietHours;
  });

  /**
   * sendPushToUser line 251: user HAS a push token, push notification is sent.
   */
  it("sends push when user has pushToken (line 251)", async () => {
    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // getUserPrefs - return empty (defaults: all enabled, no quiet hours)
          return Promise.resolve([]);
        }
        if (selectCallCount === 2) {
          // sendPushToUser - user WITH pushToken
          return Promise.resolve([{ pushToken: "ExponentPushToken[valid]" }]);
        }
        if (selectCallCount === 3) {
          // sendEmailToUser - user without email (skip email)
          return Promise.resolve([{ email: null, firstName: null }]);
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);
    mockSendPush.mockResolvedValue([{ status: "ok" }]);

    await notifyUser({
      userId: "user-with-push",
      type: "challenge_received",
      title: "Challenge!",
      body: "You got challenged!",
      data: { gameId: "g1" },
    });

    // Push should have been sent
    expect(mockSendPush).toHaveBeenCalledWith([
      expect.objectContaining({
        to: "ExponentPushToken[valid]",
        title: "Challenge!",
        body: "You got challenged!",
      }),
    ]);
  });

  /**
   * Exercise prefs where inAppEnabled=false, pushEnabled=false: covers branches
   * at lines 185 and 190 where the if-checks are false.
   */
  it("skips in-app and push when disabled in prefs (lines 185, 190)", async () => {
    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // getUserPrefs - return prefs with inApp and push disabled
          return Promise.resolve([
            {
              pushEnabled: false,
              emailEnabled: true,
              inAppEnabled: false,
              gameNotifications: true,
              challengeNotifications: true,
              turnNotifications: true,
              resultNotifications: true,
              marketingEmails: true,
              weeklyDigest: true,
              quietHoursStart: null,
              quietHoursEnd: null,
            },
          ]);
        }
        if (selectCallCount === 2) {
          // sendEmailToUser - user with email
          return Promise.resolve([{ email: "test@example.com", firstName: "Tony" }]);
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);

    await notifyUser({
      userId: "user-disabled-channels",
      type: "challenge_received",
      title: "Test",
      body: "Test body",
      data: { gameId: "game-x", opponentName: "Rival" },
    });

    // Push should NOT have been sent (pushEnabled=false)
    expect(mockSendPush).not.toHaveBeenCalled();
    // Email should still be sent (emailEnabled=true, challenge_received is high-value)
    expect(mockSendGameEventEmail).toHaveBeenCalled();
  });

  /**
   * Exercise the quiet hours path where push/email are suppressed
   * but inApp still fires. Covers lines 190, 195, and 199-201.
   */
  it("suppresses push and email during quiet hours but sends in-app (lines 190, 195, 199)", async () => {
    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // getUserPrefs - return prefs with quiet hours set (mock returns true for non-null)
          return Promise.resolve([
            {
              pushEnabled: true,
              emailEnabled: true,
              inAppEnabled: true,
              gameNotifications: true,
              challengeNotifications: true,
              turnNotifications: true,
              resultNotifications: true,
              marketingEmails: true,
              weeklyDigest: true,
              quietHoursStart: "22:00",
              quietHoursEnd: "08:00",
            },
          ]);
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);

    await notifyUser({
      userId: "user-quiet-hours",
      type: "challenge_received",
      title: "Test",
      body: "Test body",
    });

    // Push should NOT be sent (quiet hours)
    expect(mockSendPush).not.toHaveBeenCalled();
    // Email should NOT be sent (quiet hours)
    expect(mockSendGameEventEmail).not.toHaveBeenCalled();
    // In-app SHOULD be persisted (quiet hours don't affect in-app)
    expect(mockDb.insert).toHaveBeenCalled();
    // Quiet hours message should be logged
    expect(logger.debug).toHaveBeenCalledWith(
      "[Notification] Quiet hours active — push/email suppressed",
      expect.objectContaining({ userId: "user-quiet-hours" })
    );
  });

  /**
   * Exercise shouldSendForType returning false — user opted out.
   */
  it("skips notification when shouldSendForType returns false (lines 177-179)", async () => {
    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // getUserPrefs - return prefs with challengeNotifications disabled
          return Promise.resolve([
            {
              pushEnabled: true,
              emailEnabled: true,
              inAppEnabled: true,
              gameNotifications: true,
              challengeNotifications: false,
              turnNotifications: true,
              resultNotifications: true,
              marketingEmails: true,
              weeklyDigest: true,
              quietHoursStart: null,
              quietHoursEnd: null,
            },
          ]);
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);

    await notifyUser({
      userId: "user-opted-out",
      type: "challenge_received",
      title: "Test",
      body: "Test body",
    });

    // Nothing should be sent — user opted out
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockSendGameEventEmail).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      "[Notification] Skipped — user opted out",
      expect.objectContaining({ userId: "user-opted-out" })
    );
  });

  /**
   * sendEmailToUser line 284: when data has no gameId, falls back to ""
   */
  it("falls back to empty gameId when data has no gameId (line 284)", async () => {
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
          // sendEmailToUser - user with email
          return Promise.resolve([{ email: "user@example.com", firstName: "Tony" }]);
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);
    mockSendGameEventEmail.mockResolvedValue({ success: true });

    // Pass data WITHOUT gameId to trigger the || "" fallback
    await notifyUser({
      userId: "user-no-gameid",
      type: "your_turn",
      title: "Your Turn",
      body: "Play now",
      data: { opponentName: "Rival" },
    });

    // Email should be called with empty string for gameId
    expect(mockSendGameEventEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Tony",
      expect.objectContaining({ type: "your_turn", gameId: "", opponentName: "Rival" })
    );
  });

  /**
   * sendEmailToUser line 284: when data is undefined
   */
  it("handles undefined data in sendEmailToUser (line 284)", async () => {
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
          // sendEmailToUser - user with email
          return Promise.resolve([{ email: "user@example.com", firstName: "Tony" }]);
        }
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);
    mockSendGameEventEmail.mockResolvedValue({ success: true });

    // Do NOT pass data at all — data is undefined
    await notifyUser({
      userId: "user-no-data",
      type: "game_over",
      title: "Game Over",
      body: "The game ended",
    });

    expect(mockSendGameEventEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Tony",
      expect.objectContaining({ type: "game_over", gameId: "" })
    );
  });

  /**
   * shouldEmailForType returns false for non-high-value types
   * (line 210: type is not in the list)
   */
  it("does not send email for non-high-value notification types", async () => {
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
        return Promise.resolve([]);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    mockGetDb.mockReturnValue(mockDb);

    // "deadline_warning" is NOT in shouldEmailForType list
    await notifyUser({
      userId: "user-no-email-type",
      type: "deadline_warning",
      title: "Deadline",
      body: "Hurry up!",
    });

    // sendGameEventEmail should NOT be called
    expect(mockSendGameEventEmail).not.toHaveBeenCalled();
  });
});
