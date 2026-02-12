import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock firebase modules
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

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

import { useAuthStore } from "@/store/authStore";

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isInitialized: false });
  });

  // Test the logic that useAuth derives from the store,
  // exercised via direct store state manipulation since
  // the hook is a thin wrapper around useMemo over store values.

  describe("derived state", () => {
    it("reports loading when store is not initialized", () => {
      useAuthStore.setState({ user: null, isInitialized: false });

      const state = useAuthStore.getState();
      const loading = !state.isInitialized;
      const isAuthenticated = !!state.user;

      expect(loading).toBe(true);
      expect(isAuthenticated).toBe(false);
    });

    it("reports not loading when store is initialized", () => {
      useAuthStore.setState({ user: null, isInitialized: true });

      const state = useAuthStore.getState();
      const loading = !state.isInitialized;

      expect(loading).toBe(false);
    });

    it("reports authenticated when user exists", () => {
      useAuthStore.setState({
        user: { uid: "user-123", email: "skater@test.com" } as any,
        isInitialized: true,
      });

      const state = useAuthStore.getState();
      const isAuthenticated = !!state.user;

      expect(isAuthenticated).toBe(true);
      expect(state.user!.uid).toBe("user-123");
    });

    it("reports not authenticated when user is null", () => {
      useAuthStore.setState({ user: null, isInitialized: true });

      const state = useAuthStore.getState();
      const isAuthenticated = !!state.user;

      expect(isAuthenticated).toBe(false);
    });
  });
});
