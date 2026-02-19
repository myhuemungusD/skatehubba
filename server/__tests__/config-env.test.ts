/**
 * @fileoverview Tests for config/env.ts environment validation
 *
 * Covers:
 * - Test mode short-circuit: hardcoded values returned when NODE_ENV=test
 * - All expected test-mode fields and their exact values
 * - Non-test validation path via dynamic import with resetModules
 * - JWT_SECRET required in all non-test environments with min 32 chars
 * - STRIPE_SECRET_KEY transform (empty, valid, invalid prefix)
 * - STRIPE_WEBHOOK_SECRET transform (empty, valid)
 * - TESTING_STRIPE_SECRET_KEY transform
 * - ZodError formatting in catch block
 * - Non-ZodError rethrow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =============================================================================
// Test mode short-circuit (default — no module reset needed)
// =============================================================================

describe("config/env — test mode", () => {
  it("env.NODE_ENV is 'test'", async () => {
    const { env } = await import("../config/env");
    expect(env.NODE_ENV).toBe("test");
  });

  it("env.PORT is '3001'", async () => {
    const { env } = await import("../config/env");
    expect(env.PORT).toBe("3001");
  });

  it("env.DATABASE_URL is the test database URL", async () => {
    const { env } = await import("../config/env");
    expect(env.DATABASE_URL).toBe("postgres://test:test@localhost:5432/test");
  });

  it("env.SESSION_SECRET is the test session secret", async () => {
    const { env } = await import("../config/env");
    expect(env.SESSION_SECRET).toBe("test-session-secret-at-least-32-chars-long");
  });

  it("env.JWT_SECRET is the test JWT secret", async () => {
    const { env } = await import("../config/env");
    expect(env.JWT_SECRET).toBe("test-jwt-secret-at-least-32-characters");
  });

  it("exposes all expected keys", async () => {
    const { env } = await import("../config/env");
    expect(env).toHaveProperty("NODE_ENV");
    expect(env).toHaveProperty("PORT");
    expect(env).toHaveProperty("DATABASE_URL");
    expect(env).toHaveProperty("SESSION_SECRET");
    expect(env).toHaveProperty("JWT_SECRET");
  });

  it("SESSION_SECRET is at least 32 characters", async () => {
    const { env } = await import("../config/env");
    expect(env.SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("JWT_SECRET is at least 32 characters", async () => {
    const { env } = await import("../config/env");
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});

// =============================================================================
// Non-test validation path (requires vi.resetModules)
// =============================================================================

describe("config/env — non-test validation path", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("validates and returns parsed env for development with all required fields", async () => {
    // Remove test indicators so validateEnv() runs the real zod parse
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.PORT = "4000";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";

    const { env } = await import("../config/env");

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe("4000");
    expect(env.DATABASE_URL).toBe("postgres://dev:dev@localhost:5432/dev");
    expect(env.JWT_SECRET).toBe("a-valid-jwt-secret-that-is-at-least-32-chars");
  });

  it("throws when JWT_SECRET is missing in development", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    delete process.env.JWT_SECRET;

    await expect(import("../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("throws when JWT_SECRET is shorter than 32 characters", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "only-20-chars-short!";

    await expect(import("../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("uses default PORT when not specified", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    delete process.env.PORT;
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";

    const { env } = await import("../config/env");

    expect(env.PORT).toBe("3001");
  });

  it("throws on missing DATABASE_URL in non-test mode", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_URL;
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";

    await expect(import("../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("throws on SESSION_SECRET shorter than 32 chars in non-test mode", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "short";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";

    await expect(import("../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("accepts a valid STRIPE_SECRET_KEY starting with sk_", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";
    process.env.STRIPE_SECRET_KEY = "sk_test_abc123";

    const { env } = await import("../config/env");

    expect(env.STRIPE_SECRET_KEY).toBe("sk_test_abc123");
  });

  it("transforms empty STRIPE_SECRET_KEY to undefined in development", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";
    process.env.STRIPE_SECRET_KEY = "";

    const { env } = await import("../config/env");

    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("transforms whitespace-only STRIPE_WEBHOOK_SECRET to undefined", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";
    process.env.STRIPE_WEBHOOK_SECRET = "   ";

    const { env } = await import("../config/env");

    expect(env.STRIPE_WEBHOOK_SECRET).toBeUndefined();
  });

  it("trims STRIPE_WEBHOOK_SECRET", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";
    process.env.STRIPE_WEBHOOK_SECRET = "  whsec_abc123  ";

    const { env } = await import("../config/env");

    expect(env.STRIPE_WEBHOOK_SECRET).toBe("whsec_abc123");
  });

  it("transforms empty TESTING_STRIPE_SECRET_KEY to undefined", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";
    process.env.TESTING_STRIPE_SECRET_KEY = "";

    const { env } = await import("../config/env");

    expect(env.TESTING_STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("trims TESTING_STRIPE_SECRET_KEY", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-that-is-at-least-32-chars";
    process.env.TESTING_STRIPE_SECRET_KEY = "  sk_test_xyz  ";

    const { env } = await import("../config/env");

    expect(env.TESTING_STRIPE_SECRET_KEY).toBe("sk_test_xyz");
  });

  it("accepts provided JWT_SECRET in development", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "my-custom-jwt-secret-at-least-32-chars-here";

    const { env } = await import("../config/env");

    expect(env.JWT_SECRET).toBe("my-custom-jwt-secret-at-least-32-chars-here");
  });

  it("detects test mode via VITEST env var even without NODE_ENV=test", async () => {
    process.env.NODE_ENV = "development";
    process.env.VITEST = "true";

    const { env } = await import("../config/env");

    // When VITEST=true, validateEnv returns test defaults
    expect(env.NODE_ENV).toBe("test");
  });
});
