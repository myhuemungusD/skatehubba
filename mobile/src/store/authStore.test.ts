import { describe, it, expect, beforeEach, vi } from "vitest";

// Use vi.hoisted so mock fns are available inside vi.mock factories
const { mockOnAuthStateChanged, mockFirebaseSignOut, mockClearAnalytics } = vi.hoisted(() => ({
  mockOnAuthStateChanged: vi.fn(),
  mockFirebaseSignOut: vi.fn(),
  mockClearAnalytics: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/firebase.config", () => ({
  auth: { currentUser: null },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
  signOut: mockFirebaseSignOut,
}));

vi.mock("@/lib/analytics/logEvent", () => ({
  clearAnalyticsSession: mockClearAnalytics,
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

// Dynamic import to get fresh module state (module-level authUnsubscribe singleton)
let useAuthStore: any;

describe("authStore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("./authStore");
    useAuthStore = mod.useAuthStore;
  });

  describe("initial state", () => {
    it("starts with null user", () => {
      expect(useAuthStore.getState().user).toBeNull();
    });

    it("starts uninitialized", () => {
      expect(useAuthStore.getState().isInitialized).toBe(false);
    });
  });

  describe("initialize", () => {
    it("sets up onAuthStateChanged listener and returns unsubscribe", () => {
      const mockUnsub = vi.fn();
      mockOnAuthStateChanged.mockReturnValue(mockUnsub);

      const unsub = useAuthStore.getState().initialize();

      expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);
      expect(unsub).toBe(mockUnsub);
    });

    it("returns existing unsubscribe on repeated calls (singleton)", () => {
      const mockUnsub = vi.fn();
      mockOnAuthStateChanged.mockReturnValue(mockUnsub);

      const unsub1 = useAuthStore.getState().initialize();
      const unsub2 = useAuthStore.getState().initialize();

      expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);
      expect(unsub1).toBe(unsub2);
    });

    it("updates store when user signs in", () => {
      mockOnAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
        cb({ uid: "user-123", email: "skater@test.com" });
        return vi.fn();
      });

      useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.user).toEqual({ uid: "user-123", email: "skater@test.com" });
      expect(state.isInitialized).toBe(true);
    });

    it("updates store when user signs out", () => {
      mockOnAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: null) => void) => {
        cb(null);
        return vi.fn();
      });

      useAuthStore.getState().initialize();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isInitialized).toBe(true);
    });
  });

  describe("signOut", () => {
    it("calls firebaseSignOut and clears user", async () => {
      mockFirebaseSignOut.mockResolvedValue(undefined);
      useAuthStore.setState({ user: { uid: "user-123" } as any, isInitialized: true });

      await useAuthStore.getState().signOut();

      expect(mockFirebaseSignOut).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().user).toBeNull();
    });

    it("clears analytics session on sign out", async () => {
      mockFirebaseSignOut.mockResolvedValue(undefined);
      useAuthStore.setState({ user: { uid: "user-123" } as any, isInitialized: true });

      await useAuthStore.getState().signOut();

      expect(mockClearAnalytics).toHaveBeenCalledTimes(1);
    });

    it("handles sign out failure gracefully without throwing", async () => {
      mockFirebaseSignOut.mockRejectedValue(new Error("Network error"));
      useAuthStore.setState({ user: { uid: "user-123" } as any, isInitialized: true });

      // Should not throw
      await useAuthStore.getState().signOut();
    });
  });
});
