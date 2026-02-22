/**
 * Coverage tests for server/db.ts — uncovered lines 40, 86
 *
 * Line 40: getDb() throws "Database not configured" when db is null
 * Line 86: requireDb() throws "Database not configured" when db is null
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

vi.mock("pg", () => ({ default: { Pool: vi.fn(() => ({})) } }));

// Mock env with dummy URL that matches the db.ts guard to keep db null
vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "",
    NODE_ENV: "test",
  },
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => null),
}));

describe("db.ts — null db paths", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getDb() throws 'Database not configured' when db is null", async () => {
    const { getDb } = await import("../../db");
    expect(() => getDb()).toThrow("Database not configured");
  });

  it("requireDb() throws 'Database not configured' when db is null", async () => {
    const { requireDb } = await import("../../db");
    expect(() => requireDb()).toThrow("Database not configured");
  });
});
