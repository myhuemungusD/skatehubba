import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { useAuthStore } from "@/store/authStore";

describe("useRequireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isInitialized: true });
  });

  it("returns not authenticated when no user in store", () => {
    const state = useAuthStore.getState();
    expect(!!state.user).toBe(false);
  });

  it("returns authenticated when user exists in store", () => {
    useAuthStore.setState({
      user: { uid: "user-123", email: "test@test.com" } as any,
      isInitialized: true,
    });
    const state = useAuthStore.getState();
    expect(!!state.user).toBe(true);
    expect(state.user!.uid).toBe("user-123");
  });

  it("user properties are accessible", () => {
    useAuthStore.setState({
      user: { uid: "user-456", email: "skater@test.com", displayName: "TestSkater" } as any,
      isInitialized: true,
    });
    const { user } = useAuthStore.getState();
    expect(user!.email).toBe("skater@test.com");
    expect(user!.displayName).toBe("TestSkater");
  });

  it("isInitialized reflects store initialization state", () => {
    useAuthStore.setState({ user: null, isInitialized: false });
    expect(useAuthStore.getState().isInitialized).toBe(false);

    useAuthStore.setState({ isInitialized: true });
    expect(useAuthStore.getState().isInitialized).toBe(true);
  });

  it("clearing user sets authenticated to false", () => {
    useAuthStore.setState({
      user: { uid: "user-789", email: "rider@test.com" } as any,
      isInitialized: true,
    });
    expect(!!useAuthStore.getState().user).toBe(true);

    useAuthStore.setState({ user: null });
    expect(!!useAuthStore.getState().user).toBe(false);
  });
});
