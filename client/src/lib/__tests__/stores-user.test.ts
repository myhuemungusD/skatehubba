/**
 * @fileoverview Unit tests for user profile store
 * @module client/src/lib/__tests__/stores-user.test
 *
 * Tests:
 * - useUserProfileStore Zustand store actions
 * - cleanupUserAuth function
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the logger
vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}));

// We need to import after mocking
const { useUserProfileStore, cleanupUserAuth } = await import("../stores/user");

describe("useUserProfileStore", () => {
  beforeEach(() => {
    useUserProfileStore.getState().clear();
  });

  it("should initialize with correct defaults", () => {
    const state = useUserProfileStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false); // clear sets loading: false
    expect(state.error).toBeNull();
  });

  it("should set user and clear loading/error", () => {
    const mockUser = {
      uid: "user-1",
      displayName: "Kickflip King",
      email: "kick@flip.com",
      photoURL: null,
      isPro: true,
      role: "skater" as const,
      xp: 1500,
      level: 4,
    };

    useUserProfileStore.getState().setUser(mockUser);

    const state = useUserProfileStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("should set user to null", () => {
    useUserProfileStore.getState().setUser({
      uid: "u1",
      displayName: "Test",
      isPro: false,
      role: "skater",
      xp: 0,
      level: 1,
    });
    useUserProfileStore.getState().setUser(null);
    expect(useUserProfileStore.getState().user).toBeNull();
  });

  it("should set loading state", () => {
    useUserProfileStore.getState().setLoading(true);
    expect(useUserProfileStore.getState().loading).toBe(true);
    useUserProfileStore.getState().setLoading(false);
    expect(useUserProfileStore.getState().loading).toBe(false);
  });

  it("should set error state and clear loading", () => {
    useUserProfileStore.getState().setLoading(true);
    useUserProfileStore.getState().setError("Network error");
    const state = useUserProfileStore.getState();
    expect(state.error).toBe("Network error");
    expect(state.loading).toBe(false);
  });

  it("should clear all state", () => {
    useUserProfileStore.getState().setUser({
      uid: "u1",
      displayName: "Test",
      isPro: false,
      role: "skater",
      xp: 0,
      level: 1,
    });
    useUserProfileStore.getState().setError("test error");

    useUserProfileStore.getState().clear();

    const state = useUserProfileStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });
});

describe("cleanupUserAuth", () => {
  it("should clear user store state", () => {
    useUserProfileStore.getState().setUser({
      uid: "u1",
      displayName: "Test",
      isPro: false,
      role: "skater",
      xp: 0,
      level: 1,
    });

    cleanupUserAuth();

    const state = useUserProfileStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("should handle being called multiple times", () => {
    cleanupUserAuth();
    cleanupUserAuth();
    // Should not throw
    expect(useUserProfileStore.getState().user).toBeNull();
  });
});
