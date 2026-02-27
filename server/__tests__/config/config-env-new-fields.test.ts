/**
 * @fileoverview Tests for the new fields added to server/config/env.ts
 *
 * Covers the 5 schema fields introduced in the env-variable audit PR:
 * - REDIS_URL    (regex validates redis:// and rediss:// only)
 * - CRON_SECRET  (min 16 chars)
 * - LOG_LEVEL    (enum: error|warn|info|debug, default "info")
 * - APP_CHECK_MODE (enum: monitor|warn|enforce, default "monitor")
 * - CHECK_IN_RADIUS_METERS (coerced number, positive, max 150, default 100)
 *
 * Uses the same pattern as config-env.test.ts:
 *   vi.resetModules() + dynamic import to force re-evaluation of module-level code.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Minimal valid env that passes all required field checks — used as a base
// for each test that only wants to exercise one specific field.
const VALID_BASE: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://dev:dev@localhost:5432/dev",
  SESSION_SECRET: "a-valid-session-secret-at-least-32-chars-here",
  JWT_SECRET: "a-valid-jwt-secret-that-is-at-least-32-chars",
};

describe("config/env — REDIS_URL validation", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("accepts a standard redis:// URL", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.REDIS_URL = "redis://localhost:6379";

    const { env } = await import("../../config/env");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("accepts a rediss:// (TLS) URL", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.REDIS_URL = "rediss://user:pass@redis.example.com:6380";

    const { env } = await import("../../config/env");
    expect(env.REDIS_URL).toBe("rediss://user:pass@redis.example.com:6380");
  });

  it("rejects an http:// URL", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.REDIS_URL = "http://localhost:6379";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("rejects a plain hostname with no scheme", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.REDIS_URL = "localhost:6379";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("is optional — omitting it is valid", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    delete process.env.REDIS_URL;

    const { env } = await import("../../config/env");
    expect(env.REDIS_URL).toBeUndefined();
  });
});

// =============================================================================

describe("config/env — CRON_SECRET validation", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("accepts a secret that meets the 32-character minimum", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.CRON_SECRET = "exactly32characters_long_secret!";

    const { env } = await import("../../config/env");
    expect(env.CRON_SECRET).toBe("exactly32characters_long_secret!");
  });

  it("rejects a secret shorter than 32 characters", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.CRON_SECRET = "tooshort";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("is optional — omitting it is valid", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    delete process.env.CRON_SECRET;

    const { env } = await import("../../config/env");
    expect(env.CRON_SECRET).toBeUndefined();
  });
});

// =============================================================================

describe("config/env — LOG_LEVEL validation", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each(["error", "warn", "info", "debug"])('accepts valid level "%s"', async (level) => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.LOG_LEVEL = level;

    const { env } = await import("../../config/env");
    expect(env.LOG_LEVEL).toBe(level);
    vi.resetModules();
  });

  it("defaults to info when not set", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    delete process.env.LOG_LEVEL;

    const { env } = await import("../../config/env");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("rejects an unknown log level", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.LOG_LEVEL = "trace";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("rejects an uppercase level (enum is case-sensitive)", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.LOG_LEVEL = "INFO";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });
});

// =============================================================================

describe("config/env — APP_CHECK_MODE validation", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each(["monitor", "warn", "enforce"])('accepts valid mode "%s"', async (mode) => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.APP_CHECK_MODE = mode;

    const { env } = await import("../../config/env");
    expect(env.APP_CHECK_MODE).toBe(mode);
    vi.resetModules();
  });

  it("defaults to monitor when not set", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    delete process.env.APP_CHECK_MODE;

    const { env } = await import("../../config/env");
    expect(env.APP_CHECK_MODE).toBe("monitor");
  });

  it("rejects the old invalid value 'permissive'", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.APP_CHECK_MODE = "permissive";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("rejects an unknown mode", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.APP_CHECK_MODE = "disabled";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });
});

// =============================================================================

describe("config/env — CHECK_IN_RADIUS_METERS validation", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to 100 when not set", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    delete process.env.CHECK_IN_RADIUS_METERS;

    const { env } = await import("../../config/env");
    expect(env.CHECK_IN_RADIUS_METERS).toBe(100);
  });

  it("coerces a string number to a JavaScript number", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.CHECK_IN_RADIUS_METERS = "75";

    const { env } = await import("../../config/env");
    expect(env.CHECK_IN_RADIUS_METERS).toBe(75);
  });

  it("accepts the maximum allowed value of 150", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.CHECK_IN_RADIUS_METERS = "150";

    const { env } = await import("../../config/env");
    expect(env.CHECK_IN_RADIUS_METERS).toBe(150);
  });

  it("rejects a value above the 150m hard cap", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.CHECK_IN_RADIUS_METERS = "151";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("rejects zero", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.CHECK_IN_RADIUS_METERS = "0";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("rejects a negative number", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.CHECK_IN_RADIUS_METERS = "-50";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });

  it("rejects a non-numeric string", async () => {
    delete process.env.VITEST;
    Object.assign(process.env, VALID_BASE);
    process.env.CHECK_IN_RADIUS_METERS = "fifty";

    await expect(import("../../config/env")).rejects.toThrow("Environment validation failed");
  });
});
