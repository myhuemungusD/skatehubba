/**
 * @fileoverview Tests for db.ts initializeDatabase with a configured database
 *
 * Uses vi.resetModules() to force fresh module loads with specific mock configurations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Track mock calls
let mockSelectResult: any[] = [];
let mockInsertCalls: any[] = [];

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "mock-database-url-for-testing",
    NODE_ENV: "test",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        limit: vi.fn().mockImplementation(() => Promise.resolve(mockSelectResult)),
        where: vi.fn(() => ({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mockSelectResult)),
        })),
      })),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((data: any) => {
        mockInsertCalls.push({ table, data });
        return Promise.resolve(undefined);
      }),
    })),
  })),
}));

vi.mock("pg", () => {
  const MockPool = vi.fn(function (this: any) {
    this.end = vi.fn();
    return this;
  });
  return { default: { Pool: MockPool } };
});

vi.mock("../../../packages/shared/schema/index", () => ({
  usernames: { _table: "usernames", uid: { name: "uid" }, username: { name: "username" } },
  customUsers: { _table: "customUsers", id: { name: "id" }, firstName: { name: "firstName" } },
  tutorialSteps: { _table: "tutorialSteps" },
  spots: { _table: "spots" },
}));

vi.mock("../../seeds/defaultSpots", () => ({
  defaultSpots: [
    {
      name: "Test Park",
      description: "A test skatepark",
      spotType: "park",
      tier: "gold",
      lat: 34.0,
      lng: -118.0,
      address: "123 Test St",
      city: "Test City",
      state: "CA",
      country: "US",
    },
  ],
}));

describe("db module - configured database", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectResult = [];
    mockInsertCalls = [];
  });

  it("should create database connection when URL is not dummy", async () => {
    vi.resetModules();
    const mod = await import("../../db");
    // db should be set since DATABASE_URL is not the dummy URL
    expect(mod.db).not.toBeNull();
    expect(mod.isDatabaseAvailable()).toBe(true);
  });

  it("getDb should return the database instance", async () => {
    vi.resetModules();
    const mod = await import("../../db");
    const db = mod.getDb();
    expect(db).not.toBeNull();
  });

  it("requireDb should return the database instance", async () => {
    vi.resetModules();
    const mod = await import("../../db");
    const db = mod.requireDb();
    expect(db).not.toBeNull();
  });

  describe("initializeDatabase", () => {
    it("should seed tutorial steps and spots when none exist", async () => {
      mockSelectResult = []; // Empty = no existing data
      vi.resetModules();
      const mod = await import("../../db");

      await mod.initializeDatabase();

      // Should have inserted tutorial steps and spots
      expect(mockInsertCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("should skip seeding when tutorial steps already exist", async () => {
      mockSelectResult = [{ id: 1, title: "Existing" }];
      vi.resetModules();
      const mod = await import("../../db");

      mockInsertCalls = [];
      await mod.initializeDatabase();

      // Should NOT insert anything since data already exists
      expect(mockInsertCalls.length).toBe(0);
    });

    it("should handle initialization error gracefully in test env", async () => {
      vi.resetModules();
      // Override select to throw
      vi.doMock("drizzle-orm/node-postgres", () => ({
        drizzle: vi.fn(() => ({
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              limit: vi.fn().mockRejectedValue(new Error("Connection refused")),
            })),
          })),
          insert: vi.fn(),
        })),
      }));

      const mod = await import("../../db");
      // Should not throw in test mode
      await mod.initializeDatabase();

      // Restore original mock
      vi.doMock("drizzle-orm/node-postgres", () => ({
        drizzle: vi.fn(() => ({
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              limit: vi.fn().mockImplementation(() => Promise.resolve(mockSelectResult)),
              where: vi.fn(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockSelectResult)),
              })),
            })),
          })),
          insert: vi.fn((table: any) => ({
            values: vi.fn((data: any) => {
              mockInsertCalls.push({ table, data });
              return Promise.resolve(undefined);
            }),
          })),
        })),
      }));
    });
  });

  describe("getUserDisplayName", () => {
    it("should return username when found", async () => {
      vi.resetModules();
      const { getUserDisplayName } = await import("../../db");

      const mockDb: any = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ username: "kickflipKing" }]),
            })),
          })),
        })),
      };

      const name = await getUserDisplayName(mockDb, "user-1");
      expect(name).toBe("kickflipKing");
    });

    it("should fallback to firstName when no username", async () => {
      vi.resetModules();
      const { getUserDisplayName } = await import("../../db");

      let callCount = 0;
      const mockDb: any = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockImplementation(async () => {
                callCount++;
                if (callCount === 1) return []; // no username
                return [{ firstName: "Tony" }]; // has firstName
              }),
            })),
          })),
        })),
      };

      const name = await getUserDisplayName(mockDb, "user-2");
      expect(name).toBe("Tony");
    });

    it("should fallback to 'Skater' when no username or firstName", async () => {
      vi.resetModules();
      const { getUserDisplayName } = await import("../../db");

      const mockDb: any = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      };

      const name = await getUserDisplayName(mockDb, "user-3");
      expect(name).toBe("Skater");
    });
  });
});
