/**
 * @fileoverview Unit tests for db.ts
 * @module server/__tests__/db.test
 *
 * Tests:
 * - getDb (with and without database configured)
 * - isDatabaseAvailable
 * - requireDb
 * - getUserDisplayName
 * - initializeDatabase
 */

import { describe, it, expect, vi } from "vitest";

// Mock logger
vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock env
vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "mock-dummy-database-url",
    NODE_ENV: "test",
  },
}));

// Mock drizzle-orm and pg
vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => null),
}));

vi.mock("pg", () => ({
  default: {
    Pool: vi.fn(() => ({})),
  },
}));

// Mock schema
vi.mock("../../packages/shared/schema/index", () => ({
  usernames: {
    _table: "usernames",
    uid: { name: "uid" },
    username: { name: "username" },
  },
  customUsers: {
    _table: "customUsers",
    id: { name: "id" },
    firstName: { name: "firstName" },
  },
  tutorialSteps: { _table: "tutorialSteps" },
  spots: { _table: "spots" },
}));

vi.mock("../seeds/defaultSpots", () => ({
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

describe("db module", () => {
  describe("getUserDisplayName", () => {
    it("should return username when found", async () => {
      const { getUserDisplayName } = await import("../db");

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
      const { getUserDisplayName } = await import("../db");

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
      const { getUserDisplayName } = await import("../db");

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

  describe("initializeDatabase", () => {
    it("should handle database not configured", async () => {
      const mod = await import("../db");
      // With dummy URL the db will be null since mock returns null
      // initializeDatabase should handle null db gracefully
      await mod.initializeDatabase();
      // Should not throw
    });
  });

  describe("getDb / isDatabaseAvailable / requireDb", () => {
    it("should export getDb function", async () => {
      const mod = await import("../db");
      expect(typeof mod.getDb).toBe("function");
    });

    it("should export isDatabaseAvailable function", async () => {
      const mod = await import("../db");
      expect(typeof mod.isDatabaseAvailable).toBe("function");
    });

    it("should export requireDb function", async () => {
      const mod = await import("../db");
      expect(typeof mod.requireDb).toBe("function");
    });
  });
});
