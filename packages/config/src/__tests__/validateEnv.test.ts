/**
 * validateEnv() Tests
 *
 * Tests for validateEnv() function ensuring:
 * 1. Throws errors in prod/staging when required vars are missing
 * 2. Only warns in local when required vars are missing
 * 3. Passes when all required vars are present
 * 4. Required vars list is consistent with getFirebaseConfig()
 *
 * @module @skatehubba/config/__tests__
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the env module functions we need
vi.mock("../env", async () => {
  const actual = await vi.importActual("../env");
  return {
    ...actual,
    readEnv: vi.fn(),
    isProd: vi.fn(),
    isStaging: vi.fn(),
  };
});

// Import after mock
import { validateEnv, readEnv, isProd, isStaging } from "../env";

// Get the mocked functions
const mockReadEnv = readEnv as unknown as ReturnType<typeof vi.fn>;
const mockIsProd = isProd as unknown as ReturnType<typeof vi.fn>;
const mockIsStaging = isStaging as unknown as ReturnType<typeof vi.fn>;

describe("validateEnv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: local environment with all vars present
    mockIsProd.mockReturnValue(false);
    mockIsStaging.mockReturnValue(false);
    mockReadEnv.mockReturnValue("mock-value");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("when all required vars are present", () => {
    it("should not throw in production", () => {
      mockIsProd.mockReturnValue(true);
      mockReadEnv.mockReturnValue("mock-value");
      
      expect(() => validateEnv()).not.toThrow();
    });

    it("should not throw in staging", () => {
      mockIsStaging.mockReturnValue(true);
      mockReadEnv.mockReturnValue("mock-value");
      
      expect(() => validateEnv()).not.toThrow();
    });

    it("should not throw in local", () => {
      mockReadEnv.mockReturnValue("mock-value");
      
      expect(() => validateEnv()).not.toThrow();
    });
  });

  describe("when required vars are missing in production", () => {
    beforeEach(() => {
      mockIsProd.mockReturnValue(true);
      mockIsStaging.mockReturnValue(false);
    });

    it("should throw when FIREBASE_API_KEY is missing", () => {
      mockReadEnv.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_FIREBASE_API_KEY") return undefined;
        return "mock-value";
      });

      expect(() => validateEnv()).toThrow("Missing required environment variables");
      expect(() => validateEnv()).toThrow("EXPO_PUBLIC_FIREBASE_API_KEY");
    });

    it("should throw when FIREBASE_PROJECT_ID is missing", () => {
      mockReadEnv.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_FIREBASE_PROJECT_ID") return undefined;
        return "mock-value";
      });

      expect(() => validateEnv()).toThrow("Missing required environment variables");
      expect(() => validateEnv()).toThrow("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
    });

    it("should throw when FIREBASE_APP_ID is missing", () => {
      mockReadEnv.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID") return undefined;
        return "mock-value";
      });

      expect(() => validateEnv()).toThrow("Missing required environment variables");
      expect(() => validateEnv()).toThrow("EXPO_PUBLIC_FIREBASE_APP_ID");
    });

    it("should throw when multiple vars are missing", () => {
      mockReadEnv.mockImplementation((key: string) => {
        if (
          key === "EXPO_PUBLIC_FIREBASE_API_KEY" ||
          key === "EXPO_PUBLIC_FIREBASE_PROJECT_ID"
        ) {
          return undefined;
        }
        return "mock-value";
      });

      expect(() => validateEnv()).toThrow("Missing required environment variables");
      expect(() => validateEnv()).toThrow("EXPO_PUBLIC_FIREBASE_API_KEY");
      expect(() => validateEnv()).toThrow("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
    });

    it("should throw when all vars are missing", () => {
      mockReadEnv.mockReturnValue(undefined);

      expect(() => validateEnv()).toThrow("Missing required environment variables");
      expect(() => validateEnv()).toThrow("EXPO_PUBLIC_FIREBASE_API_KEY");
      expect(() => validateEnv()).toThrow("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
      expect(() => validateEnv()).toThrow("EXPO_PUBLIC_FIREBASE_APP_ID");
    });
  });

  describe("when required vars are missing in staging", () => {
    beforeEach(() => {
      mockIsProd.mockReturnValue(false);
      mockIsStaging.mockReturnValue(true);
    });

    it("should throw when vars are missing", () => {
      mockReadEnv.mockReturnValue(undefined);

      expect(() => validateEnv()).toThrow("Missing required environment variables");
      expect(() => validateEnv()).toThrow("Firebase will fail to initialize");
    });
  });

  describe("when required vars are missing in local", () => {
    beforeEach(() => {
      mockIsProd.mockReturnValue(false);
      mockIsStaging.mockReturnValue(false);
    });

    it("should only warn, not throw", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockReadEnv.mockReturnValue(undefined);

      expect(() => validateEnv()).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing required environment variables")
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe("required vars alignment", () => {
    it("should only check the 3 required vars aligned with getFirebaseConfig", () => {
      // Mock to track which vars are checked
      const checkedVars: string[] = [];
      mockReadEnv.mockImplementation((key: string) => {
        checkedVars.push(key);
        return "mock-value";
      });

      validateEnv();

      // Should only check these 3 vars
      expect(checkedVars).toEqual([
        "EXPO_PUBLIC_FIREBASE_API_KEY",
        "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
        "EXPO_PUBLIC_FIREBASE_APP_ID",
      ]);

      // Should NOT check these optional vars (they have defaults in getFirebaseConfig)
      expect(checkedVars).not.toContain("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN");
      expect(checkedVars).not.toContain("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET");
      expect(checkedVars).not.toContain("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
    });
  });
});
