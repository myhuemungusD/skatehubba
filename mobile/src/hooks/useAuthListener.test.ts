import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockOnAuthStateChanged, mockFirebaseSignOut, mockClearAnalytics, mockClearOfflineCache } =
  vi.hoisted(() => ({
    mockOnAuthStateChanged: vi.fn(),
    mockFirebaseSignOut: vi.fn(),
    mockClearAnalytics: vi.fn().mockResolvedValue(undefined),
    mockClearOfflineCache: vi.fn().mockResolvedValue(undefined),
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

vi.mock("@/lib/offlineCache", () => ({
  clearOfflineCache: mockClearOfflineCache,
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

let useAuthStore: any;

describe("useAuthListener", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("@/store/authStore");
    useAuthStore = mod.useAuthStore;
  });

  it("initialize sets up auth listener and returns unsubscribe", () => {
    const mockUnsub = vi.fn();
    mockOnAuthStateChanged.mockReturnValue(mockUnsub);

    const unsub = useAuthStore.getState().initialize();

    expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);
    expect(unsub).toBe(mockUnsub);
  });

  it("calling initialize twice returns same unsubscribe (singleton)", () => {
    const mockUnsub = vi.fn();
    mockOnAuthStateChanged.mockReturnValue(mockUnsub);

    const unsub1 = useAuthStore.getState().initialize();
    const unsub2 = useAuthStore.getState().initialize();

    expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);
    expect(unsub1).toBe(unsub2);
  });

  it("auth state changes update the store", () => {
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb({ uid: "test-uid", email: "test@example.com" });
      return vi.fn();
    });

    useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.user).toEqual({ uid: "test-uid", email: "test@example.com" });
    expect(state.isInitialized).toBe(true);
  });

  it("null user in auth state sets user to null", () => {
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: null) => void) => {
      cb(null);
      return vi.fn();
    });

    useAuthStore.getState().initialize();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isInitialized).toBe(true);
  });
});
