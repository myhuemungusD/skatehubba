/**
 * Tests for notificationService.ts — sendPushNotification
 * Covers message construction (lines 51-60) and error ticket handling (lines 62-72)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendPushNotificationsAsync, mockIsExpoPushToken } = vi.hoisted(() => ({
  mockSendPushNotificationsAsync: vi.fn(),
  mockIsExpoPushToken: vi.fn(),
}));

vi.mock("expo-server-sdk", () => {
  class MockExpo {
    sendPushNotificationsAsync = mockSendPushNotificationsAsync;
    static isExpoPushToken = (token: string) => mockIsExpoPushToken(token);
  }
  return { default: MockExpo, Expo: MockExpo };
});

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { sendPushNotification } from "../notificationService";
import logger from "../../logger";

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

    expect(result).toEqual({ success: false, error: "Invalid push token" });
    expect(logger.warn).toHaveBeenCalledWith(
      "[Notification] Invalid Expo push token",
      expect.any(Object)
    );
  });

  it("constructs message with all fields and sends successfully", async () => {
    mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok", id: "receipt-1" }]);

    const result = await sendPushNotification({
      to: "ExponentPushToken[valid]",
      title: "Game Update",
      body: "Your turn!",
      sound: "default",
      data: { gameId: "g1" },
      badge: 3,
      channelId: "games",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
      {
        to: "ExponentPushToken[valid]",
        sound: "default",
        title: "Game Update",
        body: "Your turn!",
        data: { gameId: "g1" },
        badge: 3,
        channelId: "games",
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      "[Notification] Push notification sent",
      expect.any(Object)
    );
  });

  it("uses default sound and channelId when not provided", async () => {
    mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

    await sendPushNotification({
      to: "ExponentPushToken[valid]",
      title: "Test",
      body: "Hello",
    });

    expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
      expect.objectContaining({
        sound: "default",
        channelId: "default",
        data: {},
      }),
    ]);
  });

  it("returns error when ticket status is error", async () => {
    mockSendPushNotificationsAsync.mockResolvedValue([
      {
        status: "error",
        message: "DeviceNotRegistered",
        details: { error: "DeviceNotRegistered" },
      },
    ]);

    const result = await sendPushNotification({
      to: "ExponentPushToken[expired]",
      title: "Test",
      body: "Body",
    });

    expect(result).toEqual({ success: false, error: "DeviceNotRegistered" });
    expect(logger.error).toHaveBeenCalledWith(
      "[Notification] Push notification failed",
      expect.objectContaining({
        error: "DeviceNotRegistered",
        details: { error: "DeviceNotRegistered" },
      })
    );
  });

  it("handles exception from expo SDK", async () => {
    mockSendPushNotificationsAsync.mockRejectedValue(new Error("Network timeout"));

    const result = await sendPushNotification({
      to: "ExponentPushToken[valid]",
      title: "Test",
      body: "Body",
    });

    expect(result).toEqual({ success: false, error: "Network timeout" });
    expect(logger.error).toHaveBeenCalledWith(
      "[Notification] Failed to send push notification",
      expect.any(Object)
    );
  });

  it("handles non-Error exception", async () => {
    mockSendPushNotificationsAsync.mockRejectedValue("string error");

    const result = await sendPushNotification({
      to: "ExponentPushToken[valid]",
      title: "Test",
      body: "Body",
    });

    expect(result).toEqual({ success: false, error: "Unknown error" });
  });
});
