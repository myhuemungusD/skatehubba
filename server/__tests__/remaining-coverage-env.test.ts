/**
 * Coverage tests for server/config/env.ts — additional coverage paths
 *
 * JWT_SECRET: required string throws when missing (any env)
 * STRIPE_SECRET_KEY: rejects non-sk_ key in production
 * Non-ZodError rethrow in validateEnv
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config/env — additional coverage", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /**
   * JWT_SECRET is a required string with min(32).
   * Missing in production triggers a ZodError via the required_error.
   */
  it("throws when JWT_SECRET is not set in production", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "mock://prod:prod@localhost:5432/prod";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    delete process.env.JWT_SECRET;

    await expect(import("../config/env")).rejects.toThrow();
  });

  /**
   * STRIPE_SECRET_KEY rejects non-sk_ key in production.
   * The transform throws if the value doesn't start with "sk_".
   */
  it("rejects STRIPE_SECRET_KEY not starting with sk_ in production", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "mock://prod:prod@localhost:5432/prod";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-at-least-32-characters-long-here";
    process.env.STRIPE_SECRET_KEY = "pk_test_not_a_secret_key";

    await expect(import("../config/env")).rejects.toThrow(/STRIPE_SECRET_KEY must start with sk_/);
  });

  /**
   * Non-ZodError rethrow in validateEnv catch block.
   * When envSchema.parse() throws something other than ZodError,
   * the catch block re-throws it as-is. We mock zod's parse to
   * throw a generic Error to exercise this path.
   */
  it("rethrows non-ZodError from validateEnv", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "mock://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";
    process.env.JWT_SECRET = "a-valid-jwt-secret-at-least-32-characters-long-here";

    // We'll mock the zod module to make parse throw a non-ZodError
    vi.doMock("zod", async () => {
      const actual = await vi.importActual<typeof import("zod")>("zod");
      return {
        ...actual,
        z: {
          ...actual.z,
          object: (...args: any[]) => {
            const schema = (actual.z.object as any)(...args);
            return {
              ...schema,
              parse: () => {
                throw new TypeError("Unexpected internal error");
              },
            };
          },
        },
      };
    });

    await expect(import("../config/env")).rejects.toThrow("Unexpected internal error");
  });
});
