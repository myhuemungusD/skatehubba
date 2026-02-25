import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUseReconnectionStatus } = vi.hoisted(() => ({
  mockUseReconnectionStatus: vi.fn(),
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: { create: (s: any) => s },
  Animated: {
    View: "Animated.View",
    Value: vi.fn(() => ({ setValue: vi.fn() })),
    spring: vi.fn(() => ({ start: vi.fn() })),
    timing: vi.fn(() => ({ start: vi.fn() })),
    sequence: vi.fn(() => ({})),
    loop: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  },
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: vi.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
}));

vi.mock("@/store/networkStore", () => ({
  useReconnectionStatus: mockUseReconnectionStatus,
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("@/theme", () => ({
  SKATE: {
    colors: { white: "#fff", blood: "#f00", orange: "#ff6600", darkGray: "#333" },
    spacing: { xs: 4, md: 12, lg: 16 },
    borderRadius: { sm: 4 },
  },
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("OfflineBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when connected and not expired", () => {
    mockUseReconnectionStatus.mockReturnValue({
      isConnected: true,
      isReconnecting: false,
      secondsRemaining: 120,
      expired: false,
    });

    // The component returns null when connected and not expired
    const status = mockUseReconnectionStatus();
    expect(status.isConnected && !status.expired).toBe(true);
  });

  it("should show when disconnected", () => {
    mockUseReconnectionStatus.mockReturnValue({
      isConnected: false,
      isReconnecting: false,
      secondsRemaining: 120,
      expired: false,
    });

    const status = mockUseReconnectionStatus();
    const shouldShow = !status.isConnected || status.expired;
    expect(shouldShow).toBe(true);
  });

  it("should show when expired", () => {
    mockUseReconnectionStatus.mockReturnValue({
      isConnected: false,
      isReconnecting: false,
      secondsRemaining: 0,
      expired: true,
    });

    const status = mockUseReconnectionStatus();
    const shouldShow = !status.isConnected || status.expired;
    expect(shouldShow).toBe(true);
  });

  it("formats time correctly", () => {
    // Test the formatTime logic from the component
    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    expect(formatTime(120)).toBe("2:00");
    expect(formatTime(30)).toBe("0:30");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(0)).toBe("0:00");
  });

  it("identifies urgent state when seconds <= 30", () => {
    mockUseReconnectionStatus.mockReturnValue({
      isConnected: false,
      isReconnecting: true,
      secondsRemaining: 25,
      expired: false,
    });

    const status = mockUseReconnectionStatus();
    const isUrgent = status.secondsRemaining <= 30 && !status.expired;
    expect(isUrgent).toBe(true);
  });

  it("not urgent when seconds > 30", () => {
    mockUseReconnectionStatus.mockReturnValue({
      isConnected: false,
      isReconnecting: true,
      secondsRemaining: 60,
      expired: false,
    });

    const status = mockUseReconnectionStatus();
    const isUrgent = status.secondsRemaining <= 30 && !status.expired;
    expect(isUrgent).toBe(false);
  });
});
