import { describe, it, expect, beforeEach } from "vitest";
import { useUserProfileStore, cleanupUserAuth } from "./user";

describe("useUserProfileStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useUserProfileStore.getState().clear();
  });

  it("has correct initial state", () => {
    const state = useUserProfileStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false); // clear sets loading to false
    expect(state.error).toBeNull();
  });

  it("setUser sets user and clears loading/error", () => {
    const { setError, setLoading, setUser } = useUserProfileStore.getState();

    setError("previous error");
    setLoading(true);
    setUser({
      uid: "test-uid",
      displayName: "Skater",
      isPro: false,
      role: "skater",
      xp: 100,
      level: 1,
    });

    const state = useUserProfileStore.getState();
    expect(state.user?.uid).toBe("test-uid");
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("setLoading updates loading state", () => {
    useUserProfileStore.getState().setLoading(true);
    expect(useUserProfileStore.getState().loading).toBe(true);

    useUserProfileStore.getState().setLoading(false);
    expect(useUserProfileStore.getState().loading).toBe(false);
  });

  it("setError sets error and clears loading", () => {
    useUserProfileStore.getState().setLoading(true);
    useUserProfileStore.getState().setError("Something failed");

    const state = useUserProfileStore.getState();
    expect(state.error).toBe("Something failed");
    expect(state.loading).toBe(false);
  });

  it("clear resets all state", () => {
    const store = useUserProfileStore.getState();
    store.setUser({
      uid: "uid",
      displayName: "Test",
      isPro: true,
      role: "pro",
      xp: 500,
      level: 2,
    });
    store.setError("err");

    store.clear();
    const state = useUserProfileStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("setUser with null clears user", () => {
    const store = useUserProfileStore.getState();
    store.setUser({
      uid: "uid",
      displayName: "Test",
      isPro: false,
      role: "skater",
      xp: 0,
      level: 1,
    });

    store.setUser(null);
    expect(useUserProfileStore.getState().user).toBeNull();
  });
});

describe("cleanupUserAuth", () => {
  it("clears store state", () => {
    const store = useUserProfileStore.getState();
    store.setUser({
      uid: "uid",
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
  });
});
