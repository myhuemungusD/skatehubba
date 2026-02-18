import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock isExpoGo — default to non-Expo-Go so jail-monkey would be loaded
vi.mock("../isExpoGo", () => ({ isExpoGo: false }));

// Mock jail-monkey — default: module not available (simulates Expo Go / missing native)
vi.mock("jail-monkey", () => {
  throw new Error("Cannot find native module");
});

import { checkDeviceIntegrity, isDeviceCompromised, _resetForTesting } from "../deviceIntegrity";

describe("deviceIntegrity", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe("when jail-monkey is unavailable", () => {
    it("returns safe defaults", () => {
      const result = checkDeviceIntegrity();

      expect(result.isCompromised).toBe(false);
      expect(result.isJailbroken).toBe(false);
      expect(result.canMockLocation).toBe(false);
      expect(result.isDebugMode).toBe(false);
      expect(result.hookDetected).toBe(false);
      expect(result.checkedAt).toBeGreaterThan(0);
    });

    it("isDeviceCompromised returns false", () => {
      expect(isDeviceCompromised()).toBe(false);
    });
  });

  describe("caching", () => {
    it("returns the same object on subsequent calls", () => {
      const first = checkDeviceIntegrity();
      const second = checkDeviceIntegrity();

      expect(first).toBe(second);
    });

    it("_resetForTesting clears the cache", () => {
      const first = checkDeviceIntegrity();
      _resetForTesting();
      const second = checkDeviceIntegrity();

      // Same shape but different object (re-created after reset)
      expect(first).not.toBe(second);
      expect(second.isCompromised).toBe(false);
    });
  });

  describe("result shape", () => {
    it("includes all required fields", () => {
      const result = checkDeviceIntegrity();

      expect(result).toHaveProperty("isCompromised");
      expect(result).toHaveProperty("isJailbroken");
      expect(result).toHaveProperty("canMockLocation");
      expect(result).toHaveProperty("isDebugMode");
      expect(result).toHaveProperty("hookDetected");
      expect(result).toHaveProperty("checkedAt");
    });

    it("checkedAt is a recent timestamp", () => {
      const before = Date.now();
      const result = checkDeviceIntegrity();
      const after = Date.now();

      expect(result.checkedAt).toBeGreaterThanOrEqual(before);
      expect(result.checkedAt).toBeLessThanOrEqual(after);
    });
  });
});
