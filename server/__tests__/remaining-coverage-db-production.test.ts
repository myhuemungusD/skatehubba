/**
 * Coverage test for server/db.ts — line 159
 * initializeDatabase() rethrows error in production.
 *
 * This is in its own file so module-level mocks don't interfere.
 */
import { describe, it, expect, vi } from "vitest";

// Use vi.hoisted so the mock is available when vi.mock factories run
const { fakeDb } = vi.hoisted(() => {
  const selectMock = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      limit: vi.fn().mockRejectedValue(new Error("DB connection failed")),
    }),
  });
  return { fakeDb: { select: selectMock, insert: vi.fn() } };
});

vi.mock("../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../seeds/defaultSpots", () => ({ defaultSpots: [] }));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

vi.mock("../../packages/shared/schema/index", () => ({
  usernames: { _table: "usernames", uid: { name: "uid" }, username: { name: "username" } },
  customUsers: { _table: "customUsers", id: { name: "id" }, firstName: { name: "firstName" } },
  tutorialSteps: { _table: "tutorialSteps" },
  spots: { _table: "spots" },
}));

// pg uses `new Pool()` so we need a class, not a plain function
vi.mock("pg", () => {
  class MockPool {
    connect = vi.fn();
    end = vi.fn();
    query = vi.fn();
  }
  return { default: { Pool: MockPool } };
});

vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "mock-db://test",
    NODE_ENV: "production",
  },
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn().mockReturnValue(fakeDb),
}));

describe("db.ts — production rethrow", () => {
  it("initializeDatabase rethrows error when NODE_ENV is production (line 159)", async () => {
    const { initializeDatabase } = await import("../db");
    await expect(initializeDatabase()).rejects.toThrow("DB connection failed");
  });
});
