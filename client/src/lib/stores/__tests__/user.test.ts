/**
 * Tests for client/src/lib/stores/user.ts
 *
 * Covers: useUserProfileStore (Zustand store), cleanupUserAuth.
 * The useUserProfile hook is a React hook and cannot be tested directly
 * without React render helpers, so we focus on the store actions and cleanup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../../logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { useUserProfileStore, cleanupUserAuth } from "../../stores/user";
import type { UserProfile, UserRole } from "../../stores/user";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "test-uid-123",
    displayName: "TestSkater",
    email: "test@skatehubba.com",
    photoURL: "https://example.com/photo.jpg",
    isPro: false,
    role: "skater",
    xp: 0,
    level: 1,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useUserProfileStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useUserProfileStore.setState({
      user: null,
      loading: true,
      error: null,
    });
  });

  // ──────────────────── Initial state ────────────────────────────────────

  describe("initial state", () => {
    it("has null user", () => {
      expect(useUserProfileStore.getState().user).toBeNull();
    });

    it("is in loading state", () => {
      expect(useUserProfileStore.getState().loading).toBe(true);
    });

    it("has no error", () => {
      expect(useUserProfileStore.getState().error).toBeNull();
    });
  });

  // ──────────────────── setUser ──────────────────────────────────────────

  describe("setUser", () => {
    it("sets the user profile", () => {
      const user = makeUser();
      useUserProfileStore.getState().setUser(user);

      expect(useUserProfileStore.getState().user).toEqual(user);
    });

    it("clears loading when user is set", () => {
      useUserProfileStore.getState().setUser(makeUser());

      expect(useUserProfileStore.getState().loading).toBe(false);
    });

    it("clears any existing error when user is set", () => {
      useUserProfileStore.getState().setError("previous error");
      useUserProfileStore.getState().setUser(makeUser());

      expect(useUserProfileStore.getState().error).toBeNull();
    });

    it("sets user to null (signed out)", () => {
      useUserProfileStore.getState().setUser(makeUser());
      useUserProfileStore.getState().setUser(null);

      expect(useUserProfileStore.getState().user).toBeNull();
      expect(useUserProfileStore.getState().loading).toBe(false);
    });

    it("stores all user profile fields correctly", () => {
      const user = makeUser({
        uid: "pro-uid",
        displayName: "ProSkater",
        email: "pro@skatehubba.com",
        photoURL: "https://example.com/pro.jpg",
        isPro: true,
        role: "pro",
        xp: 5000,
        level: 11,
      });

      useUserProfileStore.getState().setUser(user);
      const stored = useUserProfileStore.getState().user;

      expect(stored!.uid).toBe("pro-uid");
      expect(stored!.displayName).toBe("ProSkater");
      expect(stored!.email).toBe("pro@skatehubba.com");
      expect(stored!.photoURL).toBe("https://example.com/pro.jpg");
      expect(stored!.isPro).toBe(true);
      expect(stored!.role).toBe("pro");
      expect(stored!.xp).toBe(5000);
      expect(stored!.level).toBe(11);
    });

    it("handles user with null optional fields", () => {
      const user = makeUser({
        email: null,
        photoURL: null,
      });

      useUserProfileStore.getState().setUser(user);
      const stored = useUserProfileStore.getState().user;

      expect(stored!.email).toBeNull();
      expect(stored!.photoURL).toBeNull();
    });
  });

  // ──────────────────── setLoading ───────────────────────────────────────

  describe("setLoading", () => {
    it("sets loading to true", () => {
      useUserProfileStore.setState({ loading: false });
      useUserProfileStore.getState().setLoading(true);

      expect(useUserProfileStore.getState().loading).toBe(true);
    });

    it("sets loading to false", () => {
      useUserProfileStore.getState().setLoading(false);

      expect(useUserProfileStore.getState().loading).toBe(false);
    });

    it("does not affect other state properties", () => {
      const user = makeUser();
      useUserProfileStore.getState().setUser(user);
      useUserProfileStore.getState().setLoading(true);

      expect(useUserProfileStore.getState().user).toEqual(user);
      expect(useUserProfileStore.getState().error).toBeNull();
    });
  });

  // ──────────────────── setError ─────────────────────────────────────────

  describe("setError", () => {
    it("sets the error message", () => {
      useUserProfileStore.getState().setError("Something went wrong");

      expect(useUserProfileStore.getState().error).toBe("Something went wrong");
    });

    it("clears loading when error is set", () => {
      useUserProfileStore.getState().setLoading(true);
      useUserProfileStore.getState().setError("Auth failed");

      expect(useUserProfileStore.getState().loading).toBe(false);
    });

    it("clears the error when set to null", () => {
      useUserProfileStore.getState().setError("error");
      useUserProfileStore.getState().setError(null);

      expect(useUserProfileStore.getState().error).toBeNull();
    });
  });

  // ──────────────────── clear ────────────────────────────────────────────

  describe("clear", () => {
    it("resets user to null", () => {
      useUserProfileStore.getState().setUser(makeUser());
      useUserProfileStore.getState().clear();

      expect(useUserProfileStore.getState().user).toBeNull();
    });

    it("sets loading to false", () => {
      useUserProfileStore.getState().setLoading(true);
      useUserProfileStore.getState().clear();

      expect(useUserProfileStore.getState().loading).toBe(false);
    });

    it("clears error", () => {
      useUserProfileStore.getState().setError("some error");
      useUserProfileStore.getState().clear();

      expect(useUserProfileStore.getState().error).toBeNull();
    });

    it("resets all state at once", () => {
      useUserProfileStore.getState().setUser(makeUser());
      useUserProfileStore.getState().setError("error");
      useUserProfileStore.getState().setLoading(true);
      useUserProfileStore.getState().clear();

      const state = useUserProfileStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  // ──────────────────── State transitions ────────────────────────────────

  describe("state transitions", () => {
    it("loading -> user set (happy path)", () => {
      expect(useUserProfileStore.getState().loading).toBe(true);

      useUserProfileStore.getState().setUser(makeUser());

      const state = useUserProfileStore.getState();
      expect(state.loading).toBe(false);
      expect(state.user).not.toBeNull();
      expect(state.error).toBeNull();
    });

    it("loading -> error (auth failure)", () => {
      expect(useUserProfileStore.getState().loading).toBe(true);

      useUserProfileStore.getState().setError("Failed to initialize authentication");

      const state = useUserProfileStore.getState();
      expect(state.loading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.error).toBe("Failed to initialize authentication");
    });

    it("user set -> clear (sign out)", () => {
      useUserProfileStore.getState().setUser(makeUser());
      useUserProfileStore.getState().clear();

      const state = useUserProfileStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
    });

    it("error -> user set (retry success)", () => {
      useUserProfileStore.getState().setError("Network error");
      useUserProfileStore.getState().setUser(makeUser());

      const state = useUserProfileStore.getState();
      expect(state.user).not.toBeNull();
      expect(state.error).toBeNull();
    });
  });

  // ──────────────────── User roles ───────────────────────────────────────

  describe("user roles", () => {
    it("supports 'skater' role", () => {
      useUserProfileStore.getState().setUser(makeUser({ role: "skater" }));
      expect(useUserProfileStore.getState().user!.role).toBe("skater");
    });

    it("supports 'filmer' role", () => {
      useUserProfileStore.getState().setUser(makeUser({ role: "filmer" }));
      expect(useUserProfileStore.getState().user!.role).toBe("filmer");
    });

    it("supports 'pro' role", () => {
      useUserProfileStore.getState().setUser(makeUser({ role: "pro" }));
      expect(useUserProfileStore.getState().user!.role).toBe("pro");
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// cleanupUserAuth
// ────────────────────────────────────────────────────────────────────────────

describe("cleanupUserAuth", () => {
  beforeEach(() => {
    useUserProfileStore.setState({
      user: null,
      loading: true,
      error: null,
    });
  });

  it("clears the user store state", () => {
    useUserProfileStore.getState().setUser({
      uid: "u1",
      displayName: "Skater",
      email: null,
      photoURL: null,
      isPro: false,
      role: "skater",
      xp: 100,
      level: 1,
    });

    cleanupUserAuth();

    const state = useUserProfileStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("is safe to call multiple times", () => {
    cleanupUserAuth();
    cleanupUserAuth();
    cleanupUserAuth();

    const state = useUserProfileStore.getState();
    expect(state.user).toBeNull();
  });
});
