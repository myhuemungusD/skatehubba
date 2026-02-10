/**
 * Firebase Configuration Tests
 *
 * Tests for Firebase configuration module ensuring:
 * 1. getFirebaseConfig() returns valid config when env vars are set
 * 2. getFirebaseConfig() throws when required env vars are missing
 * 3. Optional env vars use defaults when not provided
 *
 * @module @skatehubba/config/__tests__/firebase
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the publicEnv module to control environment
vi.mock("../publicEnv", () => ({
  getAppEnv: vi.fn(),
  getPublicEnvOptional: vi.fn(),
}));

// Import after mock
import { getAppEnv, getPublicEnvOptional } from "../publicEnv";
import { getFirebaseConfig, getExpectedAppId } from "../firebase";

const mockGetAppEnv = getAppEnv as ReturnType<typeof vi.fn>;
const mockGetPublicEnvOptional = getPublicEnvOptional as ReturnType<typeof vi.fn>;

describe("Firebase Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: local environment
    mockGetAppEnv.mockReturnValue("local");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getFirebaseConfig", () => {
    it("should return valid config when all required env vars are set", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      mockGetPublicEnvOptional.mockImplementation((key: string) => {
        const mockEnv: Record<string, string> = {
          EXPO_PUBLIC_FIREBASE_API_KEY: "test-api-key",
          EXPO_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
          EXPO_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abcdef",
        };
        return mockEnv[key];
      });

      const config = getFirebaseConfig();

      expect(config).toEqual({
        apiKey: "test-api-key",
        authDomain: "test-project.firebaseapp.com",
        projectId: "test-project",
        storageBucket: "test-project.firebasestorage.app",
        messagingSenderId: "",
        appId: "1:123456789:web:abcdef",
        measurementId: undefined,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Firebase] Using env-provided config for")
      );

      consoleSpy.mockRestore();
    });

    it("should use provided optional env vars when available", () => {
      mockGetPublicEnvOptional.mockImplementation((key: string) => {
        const mockEnv: Record<string, string> = {
          EXPO_PUBLIC_FIREBASE_API_KEY: "test-api-key",
          EXPO_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
          EXPO_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abcdef",
          EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "custom.firebaseapp.com",
          EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "custom-storage.firebasestorage.app",
          EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "987654321",
          EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-MEASUREMENT",
        };
        return mockEnv[key];
      });

      const config = getFirebaseConfig();

      expect(config).toEqual({
        apiKey: "test-api-key",
        authDomain: "custom.firebaseapp.com",
        projectId: "test-project",
        storageBucket: "custom-storage.firebasestorage.app",
        messagingSenderId: "987654321",
        appId: "1:123456789:web:abcdef",
        measurementId: "G-MEASUREMENT",
      });
    });

    it("should throw when EXPO_PUBLIC_FIREBASE_API_KEY is missing", () => {
      mockGetPublicEnvOptional.mockImplementation((key: string) => {
        const mockEnv: Record<string, string> = {
          EXPO_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
          EXPO_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abcdef",
        };
        return mockEnv[key];
      });

      expect(() => getFirebaseConfig()).toThrow(
        /Missing required environment variables: EXPO_PUBLIC_FIREBASE_API_KEY/
      );
      expect(() => getFirebaseConfig()).toThrow(/Set these in your \.env file/);
    });

    it("should throw when EXPO_PUBLIC_FIREBASE_PROJECT_ID is missing", () => {
      mockGetPublicEnvOptional.mockImplementation((key: string) => {
        const mockEnv: Record<string, string> = {
          EXPO_PUBLIC_FIREBASE_API_KEY: "test-api-key",
          EXPO_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abcdef",
        };
        return mockEnv[key];
      });

      expect(() => getFirebaseConfig()).toThrow(
        /Missing required environment variables: EXPO_PUBLIC_FIREBASE_PROJECT_ID/
      );
    });

    it("should throw when EXPO_PUBLIC_FIREBASE_APP_ID is missing", () => {
      mockGetPublicEnvOptional.mockImplementation((key: string) => {
        const mockEnv: Record<string, string> = {
          EXPO_PUBLIC_FIREBASE_API_KEY: "test-api-key",
          EXPO_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
        };
        return mockEnv[key];
      });

      expect(() => getFirebaseConfig()).toThrow(
        /Missing required environment variables: EXPO_PUBLIC_FIREBASE_APP_ID/
      );
    });

    it("should throw with all missing vars when none are set", () => {
      mockGetPublicEnvOptional.mockReturnValue(undefined);

      expect(() => getFirebaseConfig()).toThrow(
        /Missing required environment variables: EXPO_PUBLIC_FIREBASE_API_KEY, EXPO_PUBLIC_FIREBASE_PROJECT_ID, EXPO_PUBLIC_FIREBASE_APP_ID/
      );
    });

    it("should throw with multiple missing vars when some are missing", () => {
      mockGetPublicEnvOptional.mockImplementation((key: string) => {
        const mockEnv: Record<string, string> = {
          EXPO_PUBLIC_FIREBASE_API_KEY: "test-api-key",
        };
        return mockEnv[key];
      });

      expect(() => getFirebaseConfig()).toThrow(
        /Missing required environment variables: EXPO_PUBLIC_FIREBASE_PROJECT_ID, EXPO_PUBLIC_FIREBASE_APP_ID/
      );
    });
  });

  describe("getExpectedAppId", () => {
    it("should return prod app id for prod environment", () => {
      mockGetPublicEnvOptional.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID_PROD") return "1:123:web:prod";
        return undefined;
      });

      expect(getExpectedAppId("prod")).toBe("1:123:web:prod");
    });

    it("should return staging app id for staging environment", () => {
      mockGetPublicEnvOptional.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID_STAGING") return "1:123:web:staging";
        return undefined;
      });

      expect(getExpectedAppId("staging")).toBe("1:123:web:staging");
    });

    it("should return default app id for local environment", () => {
      mockGetPublicEnvOptional.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID") return "1:123:web:local";
        return undefined;
      });

      expect(getExpectedAppId("local")).toBe("1:123:web:local");
    });

    it("should return empty string when env var is not set", () => {
      mockGetPublicEnvOptional.mockReturnValue(undefined);

      expect(getExpectedAppId("prod")).toBe("");
      expect(getExpectedAppId("staging")).toBe("");
      expect(getExpectedAppId("local")).toBe("");
    });
  });
});
