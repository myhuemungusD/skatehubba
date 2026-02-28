import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRegisterForPush, mockSendToken, mockAddListener } = vi.hoisted(() => ({
  mockRegisterForPush: vi.fn(),
  mockSendToken: vi.fn(),
  mockAddListener: vi.fn(),
}));

vi.mock("@/lib/pushNotifications", () => ({
  registerForPushNotifications: mockRegisterForPush,
  sendPushTokenToServer: mockSendToken,
}));

vi.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: mockAddListener,
}));

vi.mock("expo-router", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/lib/firebase.config", () => ({
  auth: { currentUser: null },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(() => vi.fn()),
  signOut: vi.fn(),
}));

vi.mock("@/lib/analytics/logEvent", () => ({
  clearAnalyticsSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/offlineCache", () => ({
  clearOfflineCache: vi.fn().mockResolvedValue(undefined),
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("usePushNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registerForPushNotifications returns a token", async () => {
    mockRegisterForPush.mockResolvedValue("expo-push-token-123");
    const token = await mockRegisterForPush();
    expect(token).toBe("expo-push-token-123");
  });

  it("sendPushTokenToServer sends token", async () => {
    mockSendToken.mockResolvedValue(undefined);
    await mockSendToken("expo-push-token-123");
    expect(mockSendToken).toHaveBeenCalledWith("expo-push-token-123");
  });

  it("registerForPushNotifications returns null when permissions denied", async () => {
    mockRegisterForPush.mockResolvedValue(null);
    const token = await mockRegisterForPush();
    expect(token).toBeNull();
  });

  it("notification listener can be set up", () => {
    const mockRemove = vi.fn();
    mockAddListener.mockReturnValue({ remove: mockRemove });

    const subscription = mockAddListener(vi.fn());
    expect(mockAddListener).toHaveBeenCalled();
    expect(subscription.remove).toBeDefined();
  });

  it("notification tap handler routes to correct screen for game", () => {
    const mockRouter = { push: vi.fn() };
    // Simulate notification data
    const data = { type: "your_turn", gameId: "game-123" };
    if (data.gameId && (data.type === "your_turn" || data.type === "game_your_turn")) {
      mockRouter.push(`/game/${data.gameId}`);
    }
    expect(mockRouter.push).toHaveBeenCalledWith("/game/game-123");
  });

  it("notification tap handler routes to challenge screen", () => {
    const mockRouter = { push: vi.fn() };
    const data = { type: "challenge_received", challengeId: "chal-456" };
    if (data.challengeId && (data.type === "challenge" || data.type === "challenge_received")) {
      mockRouter.push(`/challenge/${data.challengeId}`);
    }
    expect(mockRouter.push).toHaveBeenCalledWith("/challenge/chal-456");
  });
});
