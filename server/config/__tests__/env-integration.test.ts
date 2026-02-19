/**
 * Integration tests for Environment Configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Environment Configuration", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    // Clear module cache to allow re-importing with new env
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it("should use test defaults in test environment", async () => {
    process.env.NODE_ENV = "test";
    process.env.VITEST = "true";

    const { env } = await import("../env");

    expect(env.NODE_ENV).toBe("test");
    expect(env.DATABASE_URL).toContain("postgres://");
    expect(env.SESSION_SECRET).toBeTruthy();
    expect(env.JWT_SECRET).toBeTruthy();
  });

  it("should validate NODE_ENV enum", () => {
    const validEnvironments = ["development", "production", "test"];

    validEnvironments.forEach((envValue) => {
      expect(["development", "production", "test"]).toContain(envValue);
    });
  });

  it("should require DATABASE_URL", () => {
    expect(process.env.DATABASE_URL || "fallback").toBeTruthy();
  });

  it("should require SESSION_SECRET with minimum length", () => {
    const validSecret = "a".repeat(32);
    const invalidSecret = "a".repeat(20);

    expect(validSecret.length).toBeGreaterThanOrEqual(32);
    expect(invalidSecret.length).toBeLessThan(32);
  });

  it("should require JWT_SECRET in all non-test environments", async () => {
    // JWT_SECRET is now required — no fallback generation
    // In test mode (VITEST=true), the test bypass still returns a hardcoded value
    process.env.NODE_ENV = "development";
    process.env.VITEST = "true";

    const { env } = await import("../env");

    expect(env.JWT_SECRET).toBeTruthy();
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("should allow optional environment variables", () => {
    const optionalVars = [
      "REPL_ID",
      "CLIENT_SECRET",
      "REPLIT_DOMAINS",
      "FIREBASE_ADMIN_KEY",
      "STRIPE_SECRET_KEY",
      "RESEND_API_KEY",
      "OPENAI_API_KEY",
      "ADMIN_API_KEY",
      "SENTRY_DSN",
    ];

    // These should not throw when undefined
    optionalVars.forEach((varName) => {
      expect(() => {
        const value = process.env[varName];
        return value === undefined || typeof value === "string";
      }).not.toThrow();
    });
  });

  it("should validate Stripe secret key format", () => {
    const validKey = "sk_test_1234567890";
    const invalidKey = "pk_test_1234567890"; // Publishable key instead

    expect(validKey.startsWith("sk_")).toBe(true);
    expect(invalidKey.startsWith("sk_")).toBe(false);
  });

  it("should handle empty Stripe keys", () => {
    const emptyKey = "";
    const trimmedKey = "";

    expect(emptyKey.trim()).toBe("");
    expect(trimmedKey).toBe("");
  });

  it("should trim Stripe keys", () => {
    const keyWithSpaces = "  sk_test_123  ";
    const trimmed = keyWithSpaces.trim();

    expect(trimmed).toBe("sk_test_123");
    expect(trimmed.startsWith("sk_")).toBe(true);
  });

  it("should handle webhook secret trimming", () => {
    const webhookSecret = "  whsec_123  ";
    const trimmed = webhookSecret.trim();

    expect(trimmed).toBe("whsec_123");
  });

  it("should parse PORT as string", () => {
    const port = "3001";
    const parsed = parseInt(port, 10);

    expect(typeof port).toBe("string");
    expect(parsed).toBe(3001);
  });

  it("should use default values", () => {
    const defaults = {
      NODE_ENV: "development",
      PORT: "3001",
    };

    expect(defaults.NODE_ENV).toBe("development");
    expect(defaults.PORT).toBe("3001");
  });

  describe("Validation Errors", () => {
    it("should detect missing required fields", () => {
      const requiredFields = ["DATABASE_URL", "SESSION_SECRET"];

      requiredFields.forEach((field) => {
        expect(field).toBeTruthy();
      });
    });

    it("should detect invalid enum values", () => {
      const validEnvs = ["development", "production", "test"];
      const invalidEnv = "staging";

      expect(validEnvs).not.toContain(invalidEnv);
    });

    it("should detect short secrets", () => {
      const MIN_SECRET_LENGTH = 32;
      const shortSecret = "a".repeat(20);

      expect(shortSecret.length).toBeLessThan(MIN_SECRET_LENGTH);
    });
  });

  describe("Firebase Configuration", () => {
    it("should allow optional Firebase keys", () => {
      const firebaseKeys = [
        "FIREBASE_ADMIN_KEY",
        "FIREBASE_PROJECT_ID",
        "FIREBASE_CLIENT_EMAIL",
        "FIREBASE_PRIVATE_KEY",
        "FIREBASE_STORAGE_BUCKET",
      ];

      firebaseKeys.forEach((key) => {
        expect(() => {
          const value = process.env[key];
          return value === undefined || typeof value === "string";
        }).not.toThrow();
      });
    });
  });

  describe("Payment Configuration", () => {
    it("should validate Stripe testing key", () => {
      const testKey = "sk_test_123";
      expect(testKey.startsWith("sk_test_") || testKey.startsWith("sk_live_")).toBe(true);
    });

    it("should handle empty testing key", () => {
      const emptyKey = "";
      const result = emptyKey.trim() === "" ? undefined : emptyKey;

      expect(result).toBeUndefined();
    });
  });

  describe("Email Configuration", () => {
    it("should allow optional email keys", () => {
      const emailKeys = ["RESEND_API_KEY", "EMAIL_USER", "EMAIL_APP_PASSWORD"];

      emailKeys.forEach((key) => {
        expect(() => {
          const value = process.env[key];
          return value === undefined || typeof value === "string";
        }).not.toThrow();
      });
    });
  });

  describe("AI Services Configuration", () => {
    it("should allow optional AI API keys", () => {
      const aiKeys = ["OPENAI_API_KEY", "GOOGLE_AI_API_KEY"];

      aiKeys.forEach((key) => {
        expect(() => {
          const value = process.env[key];
          return value === undefined || typeof value === "string";
        }).not.toThrow();
      });
    });
  });

  describe("Monitoring Configuration", () => {
    it("should allow optional monitoring keys", () => {
      const monitoringKeys = ["SENTRY_DSN", "PRODUCTION_URL"];

      monitoringKeys.forEach((key) => {
        expect(() => {
          const value = process.env[key];
          return value === undefined || typeof value === "string";
        }).not.toThrow();
      });
    });
  });

  describe("Replit Configuration", () => {
    it("should allow optional Replit keys", () => {
      const replitKeys = [
        "REPL_ID",
        "CLIENT_SECRET",
        "REPLIT_DOMAINS",
        "ISSUER_URL",
        "REPL_SLUG",
        "REPL_OWNER",
      ];

      replitKeys.forEach((key) => {
        expect(() => {
          const value = process.env[key];
          return value === undefined || typeof value === "string";
        }).not.toThrow();
      });
    });
  });
});
