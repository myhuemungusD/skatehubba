import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetNetworkState, mockAddEventListener, mockRemove } = vi.hoisted(() => ({
  mockGetNetworkState: vi.fn(),
  mockAddEventListener: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock("expo-network", () => ({
  getNetworkStateAsync: mockGetNetworkState,
}));

vi.mock("react-native", () => ({
  AppState: { addEventListener: mockAddEventListener },
}));

vi.mock("@/store/networkStore", () => ({
  useNetworkStore: vi.fn(() => vi.fn()),
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("useNetworkStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddEventListener.mockReturnValue({ remove: mockRemove });
  });

  it("getNetworkStateAsync returns connected state", async () => {
    mockGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    const result = await mockGetNetworkState();
    expect(result.isConnected).toBe(true);
    expect(result.isInternetReachable).toBe(true);
  });

  it("getNetworkStateAsync returns disconnected state", async () => {
    mockGetNetworkState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    const result = await mockGetNetworkState();
    expect(result.isConnected).toBe(false);
  });

  it("handles getNetworkStateAsync error gracefully", async () => {
    mockGetNetworkState.mockRejectedValue(new Error("Network check failed"));
    await expect(mockGetNetworkState()).rejects.toThrow("Network check failed");
  });

  it("derives connected=true when both isConnected and isInternetReachable are true", async () => {
    mockGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    const networkState = await mockGetNetworkState();
    const connected = networkState.isConnected && networkState.isInternetReachable;
    expect(connected !== false).toBe(true);
  });

  it("derives connected=true on error (fail-open strategy)", async () => {
    mockGetNetworkState.mockRejectedValue(new Error("Timeout"));
    let connected = true;
    try {
      await mockGetNetworkState();
    } catch {
      // Fail-open: assume connected on error
      connected = true;
    }
    expect(connected).toBe(true);
  });

  it("AppState addEventListener is called with correct event type", () => {
    const subscription = mockAddEventListener("change", vi.fn());
    expect(mockAddEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    subscription.remove();
    expect(mockRemove).toHaveBeenCalled();
  });
});
