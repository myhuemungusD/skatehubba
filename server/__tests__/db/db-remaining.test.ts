/**
 * Coverage tests for server/db.ts — null db paths
 *
 * getDb() throws "Database not configured" when db is null
 * requireDb() throws "Database not configured" when db is null
 * DatabaseUnavailableError constructor
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../seeds/defaultSpots", () => ({ defaultSpots: [] }));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

vi.mock("../../../packages/shared/schema/index", () => ({
  usernames: { _table: "usernames", uid: { name: "uid" }, username: { name: "username" } },
  customUsers: { _table: "customUsers", id: { name: "id" }, firstName: { name: "firstName" } },
  tutorialSteps: { _table: "tutorialSteps" },
  spots: { _table: "spots" },
}));

// Mock env with empty URL to keep db null
vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "",
    NODE_ENV: "test",
  },
}));

// Mock Neon serverless
vi.mock("@neondatabase/serverless", () => ({
  Pool: vi.fn(() => ({ on: vi.fn() })),
  neonConfig: {},
}));

vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: vi.fn(() => null),
}));

describe("db.ts — null db paths", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getDb() throws DatabaseUnavailableError when db is null", async () => {
    const { getDb, DatabaseUnavailableError } = await import("../../db");
    expect(() => getDb()).toThrow("Database not configured");
    try {
      getDb();
    } catch (e: any) {
      expect(e).toBeInstanceOf(DatabaseUnavailableError);
      expect(e.name).toBe("DatabaseUnavailableError");
    }
  });

  it("requireDb() throws DatabaseUnavailableError when db is null", async () => {
    const { requireDb, DatabaseUnavailableError } = await import("../../db");
    expect(() => requireDb()).toThrow("Database not configured");
    try {
      requireDb();
    } catch (e: any) {
      expect(e).toBeInstanceOf(DatabaseUnavailableError);
      expect(e.name).toBe("DatabaseUnavailableError");
    }
  });

  it("isDatabaseAvailable() returns false when db is null", async () => {
    const { isDatabaseAvailable } = await import("../../db");
    expect(isDatabaseAvailable()).toBe(false);
  });
});
