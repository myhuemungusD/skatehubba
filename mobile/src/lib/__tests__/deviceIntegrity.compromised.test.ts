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

describe("deviceIntegrity — compromised device", () => {
  beforeEach(() => {
    _setJailMonkeyForTesting({
      isJailBroken: () => true,
      canMockLocation: true,
      isOnExternalStorage: false,
      isDebuggedMode: () => false,
      hookDetected: () => true,
    });
  });

  afterEach(() => {
    _setJailMonkeyForTesting(null);
    _resetForTesting();
  });

  it("detects jailbroken device", () => {
    const result = checkDeviceIntegrity();

    expect(result.isCompromised).toBe(true);
    expect(result.isJailbroken).toBe(true);
  });

  it("detects hook injection", () => {
    const result = checkDeviceIntegrity();

    expect(result.hookDetected).toBe(true);
  });

  it("reports mock location capability", () => {
    const result = checkDeviceIntegrity();

    expect(result.canMockLocation).toBe(true);
  });

  it("isDeviceCompromised() returns true", () => {
    expect(isDeviceCompromised()).toBe(true);
  });

  it("result is frozen (immutable)", () => {
    const result = checkDeviceIntegrity();

    expect(Object.isFrozen(result)).toBe(true);
  });

  it("checkedAt is populated", () => {
    const before = Date.now();
    const result = checkDeviceIntegrity();

    expect(result.checkedAt).toBeGreaterThanOrEqual(before);
  });

  it("caches result across calls", () => {
    const first = checkDeviceIntegrity();
    const second = checkDeviceIntegrity();

    expect(first).toBe(second);
  });

  it("isCompromised is true when only jailbroken (no hook)", () => {
    _setJailMonkeyForTesting({
      isJailBroken: () => true,
      canMockLocation: false,
      isOnExternalStorage: false,
      isDebuggedMode: () => false,
      hookDetected: () => false,
    });

    const result = checkDeviceIntegrity();

    expect(result.isCompromised).toBe(true);
    expect(result.isJailbroken).toBe(true);
    expect(result.hookDetected).toBe(false);
  });

  it("isCompromised is true when only hook detected (not jailbroken)", () => {
    _setJailMonkeyForTesting({
      isJailBroken: () => false,
      canMockLocation: false,
      isOnExternalStorage: false,
      isDebuggedMode: () => false,
      hookDetected: () => true,
    });

    const result = checkDeviceIntegrity();

    expect(result.isCompromised).toBe(true);
    expect(result.isJailbroken).toBe(false);
    expect(result.hookDetected).toBe(true);
  });

  it("isCompromised is false when device is clean", () => {
    _setJailMonkeyForTesting({
      isJailBroken: () => false,
      canMockLocation: false,
      isOnExternalStorage: false,
      isDebuggedMode: () => false,
      hookDetected: () => false,
    });

    const result = checkDeviceIntegrity();

    expect(result.isCompromised).toBe(false);
  });
});
