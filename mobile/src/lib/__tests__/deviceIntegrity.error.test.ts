import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock isExpoGo to avoid react-native import in test environment
vi.mock("../isExpoGo", () => ({ isExpoGo: false }));

// Mock jail-monkey — the actual module isn't available in test environment.
// We inject the mock via _setJailMonkeyForTesting instead.
vi.mock("jail-monkey", () => {
  throw new Error("Cannot find native module");
});

import {
  checkDeviceIntegrity,
  isDeviceCompromised,
  _resetForTesting,
  _setJailMonkeyForTesting,
} from "../deviceIntegrity";

// __DEV__ is a React Native global; stub it so the catch block doesn't throw
vi.stubGlobal("__DEV__", true);

describe("deviceIntegrity — native module error", () => {
  beforeEach(() => {
    _setJailMonkeyForTesting({
      isJailBroken: () => {
        throw new Error("native crash");
      },
      canMockLocation: false,
      isOnExternalStorage: false,
      isDebuggedMode: () => false,
      hookDetected: () => false,
    });
  });

  afterEach(() => {
    _setJailMonkeyForTesting(null);
    _resetForTesting();
  });

  it("returns safe defaults when jail-monkey throws", () => {
    const result = checkDeviceIntegrity();

    expect(result.isCompromised).toBe(false);
    expect(result.isJailbroken).toBe(false);
    expect(result.canMockLocation).toBe(false);
    expect(result.hookDetected).toBe(false);
  });

  it("does not throw", () => {
    expect(() => checkDeviceIntegrity()).not.toThrow();
  });

  it("isDeviceCompromised returns false on error", () => {
    expect(isDeviceCompromised()).toBe(false);
  });

  it("checkedAt is still populated", () => {
    const before = Date.now();
    const result = checkDeviceIntegrity();

    expect(result.checkedAt).toBeGreaterThanOrEqual(before);
  });

  it("caches error-path result", () => {
    const first = checkDeviceIntegrity();
    const second = checkDeviceIntegrity();

    expect(first).toBe(second);
  });

  it("handles isDebuggedMode throwing (iOS behavior)", () => {
    _setJailMonkeyForTesting({
      isJailBroken: () => false,
      canMockLocation: false,
      isOnExternalStorage: false,
      isDebuggedMode: () => {
        throw new Error("Android-only API");
      },
      hookDetected: () => false,
    });

    const result = checkDeviceIntegrity();

    // isDebuggedMode error is caught separately; other checks still succeed
    expect(result.isDebugMode).toBe(false);
    expect(result.isCompromised).toBe(false);
  });
});
