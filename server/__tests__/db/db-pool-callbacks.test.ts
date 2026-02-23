/**
 * Coverage tests for server/db.ts — pool event callbacks
 *
 * Line 29: pool.on("error") callback
 * Line 36: pool.on("connect") callback
 * Line 39: client.query().catch() callback inside "connect" handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to capture the pool.on handlers registered by db.ts module-level code.
// db.ts imports pg as default import and destructures { Pool } from it,
// then calls new Pool(...) and pool.on("error", ...) / pool.on("connect", ...).

describe("db.ts — pool event callbacks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("pool.on('error') callback logs error on idle client disconnect", async () => {
    const eventHandlers: Record<string, (...args: any[]) => void> = {};

    vi.doMock("pg", () => {
      const poolInstance = {
        on: (event: string, handler: any) => {
          eventHandlers[event] = handler;
          return poolInstance;
        },
      };
      return {
        default: {
          Pool: function () {
            return poolInstance;
          },
        },
      };
    });
    vi.doMock("drizzle-orm/node-postgres", () => ({
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
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock("../../logger", () => ({ default: mockLogger }));

    await import("../../db");

    // pool.on("error") should have been captured
    expect(eventHandlers.error).toBeDefined();
    eventHandlers.error(new Error("idle client disconnect"));

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Unexpected error on idle database client",
      expect.objectContaining({ error: "idle client disconnect" })
    );
  });

  it("pool.on('connect') callback sets statement_timeout on new connection", async () => {
    const eventHandlers: Record<string, (...args: any[]) => void> = {};

    vi.doMock("pg", () => {
      const poolInstance = {
        on: (event: string, handler: any) => {
          eventHandlers[event] = handler;
          return poolInstance;
        },
      };
      return {
        default: {
          Pool: function () {
            return poolInstance;
          },
        },
      };
    });
    vi.doMock("drizzle-orm/node-postgres", () => ({
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
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock("../../logger", () => ({ default: mockLogger }));

    await import("../../db");

    expect(eventHandlers.connect).toBeDefined();
    const mockClient = { query: vi.fn().mockResolvedValue(undefined) };
    // The connect handler calls client.query().catch() — it's fire-and-forget
    eventHandlers.connect(mockClient);

    expect(mockClient.query).toHaveBeenCalledWith("SET statement_timeout = '10000'");
  });

  it("pool.on('connect') logs error when SET statement_timeout fails", async () => {
    const eventHandlers: Record<string, (...args: any[]) => void> = {};

    vi.doMock("pg", () => {
      const poolInstance = {
        on: (event: string, handler: any) => {
          eventHandlers[event] = handler;
          return poolInstance;
        },
      };
      return {
        default: {
          Pool: function () {
            return poolInstance;
          },
        },
      };
    });
    vi.doMock("drizzle-orm/node-postgres", () => ({
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
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock("../../logger", () => ({ default: mockLogger }));

    await import("../../db");

    // Trigger connect with a client whose query rejects
    const mockClient = { query: vi.fn().mockRejectedValue(new Error("SET failed")) };
    eventHandlers.connect(mockClient);

    // Wait for the promise rejection to propagate through .catch()
    await new Promise((r) => setTimeout(r, 20));

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to set statement_timeout on new connection",
      expect.objectContaining({ error: "SET failed" })
    );
  });
});
