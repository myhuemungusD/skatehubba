/**
 * @fileoverview Coverage tests for uncovered ternary branches in server/db.ts
 *
 * Covers the `String(error)` (non-Error) branch of three ternaries:
 *  1. pool.on("connect") catch handler (line 42) — when err is not instanceof Error
 *  2. Module-level catch block (line 57) — when error is not instanceof Error
 *  3. initializeDatabase catch block (line 193) — when error is not instanceof Error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("db.ts — pool.on('connect') catch with non-Error value", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("logs String(err) when client.query rejects with a non-Error value (line 42)", async () => {
    const eventHandlers: Record<string, (...args: any[]) => void> = {};
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    vi.doMock("@neondatabase/serverless", () => {
      const poolInstance = {
        on: (event: string, handler: any) => {
          eventHandlers[event] = handler;
          return poolInstance;
        },
      };
      return {
        Pool: function () {
          return poolInstance;
        },
        neonConfig: {},
      };
    });
    vi.doMock("drizzle-orm/neon-serverless", () => ({
      drizzle: vi.fn(() => ({ _db: true })),
    }));
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://real-url:5432/testdb",
        NODE_ENV: "test",
        DB_POOL_MAX: 10,
        DB_POOL_IDLE_TIMEOUT_MS: 30000,
        DB_POOL_CONNECTION_TIMEOUT_MS: 5000,
        DB_STATEMENT_TIMEOUT_MS: 10000,
      },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../../packages/shared/schema/index", () => ({
      usernames: { uid: "uid", username: "username" },
      customUsers: { id: "id", firstName: "firstName" },
      tutorialSteps: {},
      spots: {},
    }));
    vi.doMock("../../seeds/defaultSpots", () => ({ defaultSpots: [] }));
    vi.doMock("../../logger", () => ({ default: mockLogger }));

    await import("../../db");

    expect(eventHandlers.connect).toBeDefined();

    // Reject with a string (not an Error instance) to hit the String(err) branch
    const mockClient = { query: vi.fn().mockRejectedValue("connection timeout string") };
    eventHandlers.connect(mockClient);

    // Wait for the promise rejection to propagate through .catch()
    await new Promise((r) => setTimeout(r, 20));

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to set statement_timeout on new connection",
      expect.objectContaining({ error: "connection timeout string" })
    );
  });
});

describe("db.ts — module-level catch with non-Error value (line 57)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("sets db/pool to null when Pool constructor throws a non-Error value", async () => {
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    vi.doMock("@neondatabase/serverless", () => {
      // Use a proper function constructor that throws a non-Error value
      function ThrowingPool() {
        throw "string error from pool"; // eslint-disable-line no-throw-literal
      }
      return { Pool: ThrowingPool, neonConfig: {} };
    });
    vi.doMock("drizzle-orm/neon-serverless", () => ({
      drizzle: vi.fn(() => ({})),
    }));
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://real-url:5432/testdb",
        NODE_ENV: "test",
      },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../../packages/shared/schema/index", () => ({
      usernames: { uid: "uid", username: "username" },
      customUsers: { id: "id", firstName: "firstName" },
      tutorialSteps: {},
      spots: {},
    }));
    vi.doMock("../../seeds/defaultSpots", () => ({ defaultSpots: [] }));
    vi.doMock("../../logger", () => ({
      default: mockLogger,
      createChildLogger: vi.fn(() => mockLogger),
    }));

    const { db, pool, isDatabaseAvailable } = await import("../../db");
    expect(db).toBeNull();
    expect(pool).toBeNull();
    expect(isDatabaseAvailable()).toBe(false);

    // Should have logged with String(error) since the thrown value is a string
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Database connection setup failed",
      expect.objectContaining({ error: "string error from pool" })
    );
  });
});

describe("db.ts — initializeDatabase catch with non-Error value (line 193)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("logs String(error) when initializeDatabase fails with a non-Error value", async () => {
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue("non-error init failure"), // non-Error value
      }),
    });
    const fakeDb = { select: mockSelect, insert: vi.fn() };

    vi.doMock("@neondatabase/serverless", () => {
      function MockPool(this: any) {
        this.on = vi.fn();
      }
      return { Pool: MockPool, neonConfig: {} };
    });
    vi.doMock("drizzle-orm/neon-serverless", () => ({
      drizzle: vi.fn(() => fakeDb),
    }));
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://real-url:5432/testdb",
        NODE_ENV: "test",
        DB_POOL_MAX: 10,
        DB_POOL_IDLE_TIMEOUT_MS: 30000,
        DB_POOL_CONNECTION_TIMEOUT_MS: 5000,
        DB_STATEMENT_TIMEOUT_MS: 10000,
      },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../../packages/shared/schema/index", () => ({
      usernames: { uid: "uid", username: "username" },
      customUsers: { id: "id", firstName: "firstName" },
      tutorialSteps: { _table: "tutorial_steps" },
      spots: { _table: "spots" },
    }));
    vi.doMock("../../seeds/defaultSpots", () => ({ defaultSpots: [] }));
    vi.doMock("../../logger", () => ({
      default: mockLogger,
      createChildLogger: vi.fn(() => mockLogger),
    }));

    const dbModule = await import("../../db");

    // Verify db is not null so initializeDatabase runs the seeding logic
    expect(dbModule.db).not.toBeNull();

    // initializeDatabase should not throw in test mode but should log the error
    await dbModule.initializeDatabase();

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Database initialization failed - continuing without defaults",
      expect.objectContaining({ error: "non-error init failure" })
    );
  });
});
