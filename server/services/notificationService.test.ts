import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mocks referenced inside vi.mock factories
const { mockSendPush, mockIsExpoPushToken } = vi.hoisted(() => ({
  mockSendPush: vi.fn(),
  mockIsExpoPushToken: vi.fn(),
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
}));

import {
  sendPushNotification,
  sendChallengeNotification,
  sendQuickMatchNotification,
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
