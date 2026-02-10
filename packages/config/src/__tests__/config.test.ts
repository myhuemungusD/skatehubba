/**
 * Environment Configuration Tests
 *
 * Tests for @skatehubba/config package ensuring:
 * 1. assertEnvWiring() throws on misconfigurations
 * 2. getEnvPath() always prepends /env/{env}/
 * 3. validateWritePath() rejects non-namespaced writes
 *
 * @module @skatehubba/config/__tests__
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the env module to control environment
vi.mock("../env", () => ({
  getAppEnv: vi.fn(),
  getEnvOptional: vi.fn(),
}));

// Import after mock
import { getAppEnv, getEnvOptional } from "../env";
import { assertEnvWiring, validateWritePath, EnvMismatchError, getEnvBanner } from "../guardrails";
import { getEnvPath, getStoragePath } from "../runtime";

const mockGetAppEnv = getAppEnv as ReturnType<typeof vi.fn>;
const mockGetEnvOptional = getEnvOptional as ReturnType<typeof vi.fn>;

describe("@skatehubba/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: local environment
    mockGetAppEnv.mockReturnValue("local");
    mockGetEnvOptional.mockImplementation((key: string) => {
      const mockEnv: Record<string, string> = {
        EXPO_PUBLIC_API_BASE_URL: "http://localhost:3001",
        EXPO_PUBLIC_APP_ENV: "local",
        EXPO_PUBLIC_FIREBASE_APP_ID: "1:665573979824:web:731aaae46daea5efee2d75",
        EXPO_PUBLIC_FIREBASE_APP_ID_PROD: "1:665573979824:web:731aaae46daea5efee2d75",
        EXPO_PUBLIC_FIREBASE_APP_ID_STAGING: "1:665573979824:web:STAGING_APP_ID",
      };
      return mockEnv[key] || "";
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("assertEnvWiring", () => {
    it("should pass for correctly configured local environment", () => {
      mockGetAppEnv.mockReturnValue("local");
      expect(() => assertEnvWiring()).not.toThrow();
    });

    it("should throw EnvMismatchError when prod build points at staging API", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_API_BASE_URL") return "https://staging-api.skatehubba.com";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID")
          return "1:665573979824:web:731aaae46daea5efee2d75";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID_PROD")
          return "1:665573979824:web:731aaae46daea5efee2d75";
        return "";
      });

      expect(() => assertEnvWiring()).toThrow(EnvMismatchError);
      expect(() => assertEnvWiring()).toThrow("prod build pointing at staging API");
    });

    it("should throw EnvMismatchError when prod build points at localhost API", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_API_BASE_URL") return "http://localhost:3001";
        return "";
      });

      expect(() => assertEnvWiring()).toThrow(EnvMismatchError);
      expect(() => assertEnvWiring()).toThrow("prod build pointing at localhost API");
    });

    it("should throw EnvMismatchError when staging build points at prod API", () => {
      mockGetAppEnv.mockReturnValue("staging");
      mockGetEnvOptional.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_API_BASE_URL") return "https://api.skatehubba.com";
        return "";
      });

      expect(() => assertEnvWiring()).toThrow(EnvMismatchError);
      expect(() => assertEnvWiring()).toThrow("staging build pointing at prod API");
    });

    it("should throw EnvMismatchError when prod build uses wrong Firebase appId", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_API_BASE_URL") return "https://api.skatehubba.com";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID") return "1:665573979824:web:WRONG_APP_ID";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID_PROD") return "1:665573979824:web:CORRECT_PROD_ID";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID_STAGING") return "1:665573979824:web:STAGING_ID";
        return "";
      });

      expect(() => assertEnvWiring()).toThrow(EnvMismatchError);
      expect(() => assertEnvWiring()).toThrow("non-prod Firebase appId");
    });

    it("should throw EnvMismatchError when staging build uses prod Firebase appId", () => {
      mockGetAppEnv.mockReturnValue("staging");
      mockGetEnvOptional.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_API_BASE_URL") return "https://staging-api.skatehubba.com";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID") return "1:665573979824:web:PROD_APP_ID";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID_PROD") return "1:665573979824:web:PROD_APP_ID";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID_STAGING") return "1:665573979824:web:STAGING_ID";
        return "";
      });

      expect(() => assertEnvWiring()).toThrow(EnvMismatchError);
      expect(() => assertEnvWiring()).toThrow("non-staging Firebase appId");
    });

    it("should pass for correctly configured staging environment", () => {
      mockGetAppEnv.mockReturnValue("staging");
      mockGetEnvOptional.mockImplementation((key: string) => {
        if (key === "EXPO_PUBLIC_API_BASE_URL") return "https://staging-api.skatehubba.com";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID") return "1:665573979824:web:STAGING_ID";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID_PROD") return "1:665573979824:web:PROD_ID";
        if (key === "EXPO_PUBLIC_FIREBASE_APP_ID_STAGING") return "1:665573979824:web:STAGING_ID";
        return "";
      });

      expect(() => assertEnvWiring()).not.toThrow();
    });
  });

  describe("getEnvPath", () => {
    it("should prepend /env/prod/ for production environment", () => {
      mockGetAppEnv.mockReturnValue("prod");
      expect(getEnvPath("users/abc123")).toBe("env/prod/users/abc123");
    });

    it("should prepend /env/staging/ for staging environment", () => {
      mockGetAppEnv.mockReturnValue("staging");
      expect(getEnvPath("users/abc123")).toBe("env/staging/users/abc123");
    });

    it("should prepend /env/local/ for local environment", () => {
      mockGetAppEnv.mockReturnValue("local");
      expect(getEnvPath("users/abc123")).toBe("env/local/users/abc123");
    });

    it("should handle paths that already have leading slash", () => {
      mockGetAppEnv.mockReturnValue("prod");
      expect(getEnvPath("/users/abc123")).toBe("env/prod/users/abc123");
    });

    it("should handle complex nested paths", () => {
      mockGetAppEnv.mockReturnValue("staging");
      expect(getEnvPath("checkins/spot123/ratings/user456")).toBe(
        "env/staging/checkins/spot123/ratings/user456"
      );
    });

    it("should never produce double-slashed paths", () => {
      mockGetAppEnv.mockReturnValue("prod");
      const result = getEnvPath("users//double//slash");
      expect(result).not.toContain("//");
    });
  });

  describe("getStoragePath", () => {
    it("should prepend env/prod/ for production environment", () => {
      mockGetAppEnv.mockReturnValue("prod");
      expect(getStoragePath("uploads/image.png")).toBe("env/prod/uploads/image.png");
    });

    it("should prepend env/staging/ for staging environment", () => {
      mockGetAppEnv.mockReturnValue("staging");
      expect(getStoragePath("uploads/image.png")).toBe("env/staging/uploads/image.png");
    });
  });

  describe("validateWritePath", () => {
    it("should pass for correctly namespaced prod paths", () => {
      mockGetAppEnv.mockReturnValue("prod");
      expect(() => validateWritePath("env/prod/users/abc123")).not.toThrow();
    });

    it("should pass for correctly namespaced staging paths", () => {
      mockGetAppEnv.mockReturnValue("staging");
      expect(() => validateWritePath("env/staging/users/abc123")).not.toThrow();
    });

    it("should throw for non-namespaced paths in prod", () => {
      mockGetAppEnv.mockReturnValue("prod");
      expect(() => validateWritePath("users/abc123")).toThrow(EnvMismatchError);
    });

    it("should throw for non-namespaced paths in staging", () => {
      mockGetAppEnv.mockReturnValue("staging");
      expect(() => validateWritePath("users/abc123")).toThrow(EnvMismatchError);
    });

    it("should throw when staging tries to write to prod namespace", () => {
      mockGetAppEnv.mockReturnValue("staging");
      expect(() => validateWritePath("env/prod/users/abc123")).toThrow(EnvMismatchError);
    });

    it("should throw when prod tries to write to staging namespace", () => {
      mockGetAppEnv.mockReturnValue("prod");
      expect(() => validateWritePath("env/staging/users/abc123")).toThrow(EnvMismatchError);
    });

    it("should warn but not throw for non-namespaced paths in local dev", () => {
      mockGetAppEnv.mockReturnValue("local");
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => validateWritePath("users/abc123")).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("getEnvBanner", () => {
    it("should return null for production", () => {
      mockGetAppEnv.mockReturnValue("prod");
      expect(getEnvBanner()).toBeNull();
    });

    it("should return staging banner for staging", () => {
      mockGetAppEnv.mockReturnValue("staging");
      expect(getEnvBanner()).toBe("🧪 STAGING ENVIRONMENT");
    });

    it("should return local banner for local", () => {
      mockGetAppEnv.mockReturnValue("local");
      expect(getEnvBanner()).toBe("🛠️ LOCAL DEVELOPMENT");
    });
  });

  describe("EnvMismatchError", () => {
    it("should have correct name", () => {
      const error = new EnvMismatchError("test");
      expect(error.name).toBe("EnvMismatchError");
    });

    it("should include 🚨 in message", () => {
      const error = new EnvMismatchError("test");
      expect(error.message).toContain("🚨");
    });

    it("should be instanceof Error", () => {
      const error = new EnvMismatchError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });
});
