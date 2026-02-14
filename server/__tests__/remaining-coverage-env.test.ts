/**
 * Coverage tests for server/config/env.ts — uncovered lines ~64, 100-105, 160
 *
 * Line 64: JWT_SECRET transform throws in production when not set
 * Lines 100-105: STRIPE_SECRET_KEY rejects non-sk_ key in production
 * Line 160: Non-ZodError rethrow in validateEnv
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";

describe("config/env — additional coverage", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clean up .jwt-secret.dev if created
    const secretPath = join(process.cwd(), ".jwt-secret.dev");
    if (existsSync(secretPath)) {
      try {
        unlinkSync(secretPath);
      } catch (e) {
        // Ignore
      }
    }
  });

  /**
   * Line 64: JWT_SECRET transform throws when not set in production
   *
   * The transform does:
   *   if (!val) {
   *     if (process.env.NODE_ENV === "production") {
   *       throw new Error("JWT_SECRET is required in production");
   *     }
   *   }
   *
   * Since this throw happens inside a zod transform, it becomes a ZodError.
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
   * Lines 100-105: STRIPE_SECRET_KEY rejects non-sk_ key in production
   *
   * In production, if STRIPE_SECRET_KEY doesn't start with "sk_", it should throw.
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
   * Line 160: Non-ZodError rethrow
   *
   * The catch block does:
   *   if (error instanceof z.ZodError) { ... format and throw ... }
   *   throw error;  // Line 160
   *
   * This is reached when envSchema.parse throws something other than ZodError.
   * The JWT_SECRET transform throws a plain Error ("JWT_SECRET is required in production")
   * which Zod wraps in a ZodError. To hit the raw rethrow, we need parse() itself
   * to throw a non-ZodError. We can do this by making the import fail differently.
   *
   * Actually, the line 160 is: throw error; in the else branch of:
   *   catch (error) {
   *     if (error instanceof z.ZodError) { ... }
   *     throw error;  // <-- line 160
   *   }
   *
   * We need envSchema.parse() to throw a non-ZodError. One way: mock zod's parse to throw
   * a generic Error.
   */
  it("rethrows non-ZodError from validateEnv", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "mock://dev:dev@localhost:5432/dev";
    process.env.SESSION_SECRET = "a-valid-session-secret-at-least-32-chars-here";

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
