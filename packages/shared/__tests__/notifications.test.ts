/**
 * Tests for packages/shared/schema/notifications.ts
 *
 * Covers:
 * - NOTIFICATION_TYPES and NOTIFICATION_CHANNELS constants
 * - DEFAULT_NOTIFICATION_PREFS
 * - shouldSendForType function (lines 150-153)
 */

import {
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  DEFAULT_NOTIFICATION_PREFS,
  shouldSendForType,
  isWithinQuietHours,
  type NotificationType,
  type NotificationPrefs,
} from "../schema/notifications";

describe("NOTIFICATION_TYPES", () => {
  it("contains expected notification types", () => {
    expect(NOTIFICATION_TYPES).toContain("challenge_received");
    expect(NOTIFICATION_TYPES).toContain("your_turn");
    expect(NOTIFICATION_TYPES).toContain("game_over");
    expect(NOTIFICATION_TYPES).toContain("opponent_forfeited");
    expect(NOTIFICATION_TYPES).toContain("game_forfeited_timeout");
    expect(NOTIFICATION_TYPES).toContain("deadline_warning");
    expect(NOTIFICATION_TYPES).toContain("dispute_filed");
    expect(NOTIFICATION_TYPES).toContain("welcome");
    expect(NOTIFICATION_TYPES).toContain("payment_receipt");
    expect(NOTIFICATION_TYPES).toContain("weekly_digest");
    expect(NOTIFICATION_TYPES).toContain("quick_match");
    expect(NOTIFICATION_TYPES).toContain("system");
  });
});

describe("NOTIFICATION_CHANNELS", () => {
  it("contains push, email, and in_app", () => {
    expect(NOTIFICATION_CHANNELS).toContain("push");
    expect(NOTIFICATION_CHANNELS).toContain("email");
    expect(NOTIFICATION_CHANNELS).toContain("in_app");
  });
});

describe("DEFAULT_NOTIFICATION_PREFS", () => {
  it("has all flags enabled by default", () => {
    expect(DEFAULT_NOTIFICATION_PREFS.pushEnabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.emailEnabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.inAppEnabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.gameNotifications).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.challengeNotifications).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.turnNotifications).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.resultNotifications).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.marketingEmails).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.weeklyDigest).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.quietHoursStart).toBeNull();
    expect(DEFAULT_NOTIFICATION_PREFS.quietHoursEnd).toBeNull();
  });
});

describe("shouldSendForType", () => {
  const allEnabled: Pick<
    NotificationPrefs,
    "gameNotifications" | "challengeNotifications" | "turnNotifications" | "resultNotifications"
  > = {
    gameNotifications: true,
    challengeNotifications: true,
    turnNotifications: true,
    resultNotifications: true,
  };

  it("returns true for all types when all prefs are enabled", () => {
    const gameTypes: NotificationType[] = [
      "challenge_received",
      "your_turn",
      "game_over",
      "opponent_forfeited",
      "game_forfeited_timeout",
      "deadline_warning",
      "dispute_filed",
      "quick_match",
    ];
    for (const type of gameTypes) {
      expect(shouldSendForType(allEnabled, type)).toBe(true);
    }
  });

  it("returns true for non-game types regardless of prefs", () => {
    const prefs = {
      gameNotifications: false,
      challengeNotifications: false,
      turnNotifications: false,
      resultNotifications: false,
    };
    // welcome, payment_receipt, weekly_digest, system are not in any game/challenge/turn/result set
    expect(shouldSendForType(prefs, "welcome")).toBe(true);
    expect(shouldSendForType(prefs, "payment_receipt")).toBe(true);
    expect(shouldSendForType(prefs, "weekly_digest")).toBe(true);
    expect(shouldSendForType(prefs, "system")).toBe(true);
  });

  // Lines 150-153: each disabled pref should block matching notification types

  it("returns false for game types when gameNotifications is disabled (line 150)", () => {
    const prefs = { ...allEnabled, gameNotifications: false };
    // All types in GAME_TYPES should be blocked
    expect(shouldSendForType(prefs, "challenge_received")).toBe(false);
    expect(shouldSendForType(prefs, "your_turn")).toBe(false);
    expect(shouldSendForType(prefs, "game_over")).toBe(false);
    expect(shouldSendForType(prefs, "opponent_forfeited")).toBe(false);
    expect(shouldSendForType(prefs, "game_forfeited_timeout")).toBe(false);
    expect(shouldSendForType(prefs, "deadline_warning")).toBe(false);
    expect(shouldSendForType(prefs, "dispute_filed")).toBe(false);
    expect(shouldSendForType(prefs, "quick_match")).toBe(false);
  });

  it("returns false for challenge types when challengeNotifications is disabled (line 151)", () => {
    const prefs = { ...allEnabled, challengeNotifications: false };
    // CHALLENGE_TYPES: challenge_received, quick_match
    expect(shouldSendForType(prefs, "challenge_received")).toBe(false);
    expect(shouldSendForType(prefs, "quick_match")).toBe(false);
    // Other game types should still be true
    expect(shouldSendForType(prefs, "your_turn")).toBe(true);
    expect(shouldSendForType(prefs, "game_over")).toBe(true);
  });

  it("returns false for turn types when turnNotifications is disabled (line 152)", () => {
    const prefs = { ...allEnabled, turnNotifications: false };
    // TURN_TYPES: your_turn, deadline_warning
    expect(shouldSendForType(prefs, "your_turn")).toBe(false);
    expect(shouldSendForType(prefs, "deadline_warning")).toBe(false);
    // Other types should still be true
    expect(shouldSendForType(prefs, "game_over")).toBe(true);
    expect(shouldSendForType(prefs, "challenge_received")).toBe(true);
  });

  it("returns false for result types when resultNotifications is disabled (line 153)", () => {
    const prefs = { ...allEnabled, resultNotifications: false };
    // RESULT_TYPES: game_over, opponent_forfeited, game_forfeited_timeout
    expect(shouldSendForType(prefs, "game_over")).toBe(false);
    expect(shouldSendForType(prefs, "opponent_forfeited")).toBe(false);
    expect(shouldSendForType(prefs, "game_forfeited_timeout")).toBe(false);
    // Other types should still be true
    expect(shouldSendForType(prefs, "your_turn")).toBe(true);
    expect(shouldSendForType(prefs, "challenge_received")).toBe(true);
  });

  it("checks all pref layers - type in multiple sets gets blocked by any disabled pref", () => {
    // challenge_received is in both GAME_TYPES and CHALLENGE_TYPES
    // If only challengeNotifications is disabled, it should still be blocked
    const prefs1 = { ...allEnabled, challengeNotifications: false };
    expect(shouldSendForType(prefs1, "challenge_received")).toBe(false);

    // your_turn is in both GAME_TYPES and TURN_TYPES
    const prefs2 = { ...allEnabled, turnNotifications: false };
    expect(shouldSendForType(prefs2, "your_turn")).toBe(false);

    // game_over is in both GAME_TYPES and RESULT_TYPES
    const prefs3 = { ...allEnabled, resultNotifications: false };
    expect(shouldSendForType(prefs3, "game_over")).toBe(false);
  });
});

describe("isWithinQuietHours", () => {
  it("returns false when quiet hours are not set", () => {
    expect(isWithinQuietHours(null, null, "14:00")).toBe(false);
    expect(isWithinQuietHours("22:00", null, "23:00")).toBe(false);
    expect(isWithinQuietHours(null, "07:00", "03:00")).toBe(false);
  });

  it("returns true within same-day range", () => {
    expect(isWithinQuietHours("09:00", "17:00", "12:00")).toBe(true);
    expect(isWithinQuietHours("09:00", "17:00", "09:00")).toBe(true);
    expect(isWithinQuietHours("09:00", "17:00", "16:59")).toBe(true);
  });

  it("returns false outside same-day range", () => {
    expect(isWithinQuietHours("09:00", "17:00", "08:59")).toBe(false);
    expect(isWithinQuietHours("09:00", "17:00", "17:00")).toBe(false);
    expect(isWithinQuietHours("09:00", "17:00", "23:00")).toBe(false);
  });

  it("returns true within overnight range", () => {
    expect(isWithinQuietHours("22:00", "07:00", "23:00")).toBe(true);
    expect(isWithinQuietHours("22:00", "07:00", "22:00")).toBe(true);
    expect(isWithinQuietHours("22:00", "07:00", "03:00")).toBe(true);
    expect(isWithinQuietHours("22:00", "07:00", "06:59")).toBe(true);
    expect(isWithinQuietHours("22:00", "07:00", "00:00")).toBe(true);
  });

  it("returns false outside overnight range", () => {
    expect(isWithinQuietHours("22:00", "07:00", "07:00")).toBe(false);
    expect(isWithinQuietHours("22:00", "07:00", "12:00")).toBe(false);
    expect(isWithinQuietHours("22:00", "07:00", "21:59")).toBe(false);
    expect(isWithinQuietHours("22:00", "07:00", "07:01")).toBe(false);
  });

  it("handles edge case where start equals end (zero-length window)", () => {
    // When start === end with same-day logic: now >= start && now < end is always false
    expect(isWithinQuietHours("12:00", "12:00", "12:00")).toBe(false);
    expect(isWithinQuietHours("12:00", "12:00", "11:59")).toBe(false);
  });

  it("uses current time when currentTimeHHMM is not provided (line 175 fallback)", () => {
    // Use a wide overnight range that covers any time of day
    // 00:00–23:59 ensures it's always within quiet hours regardless of when test runs
    const result = isWithinQuietHours("00:00", "23:59");
    expect(result).toBe(true);
  });
});
