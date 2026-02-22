/**
 * Isolated test for db.ts getUserDisplayName() fallback branch.
 * Must be in its own file to avoid vi.mock() conflicts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  env: { DATABASE_URL: "", NODE_ENV: "test" },
}));

vi.mock("../../seeds/defaultSpots", () => ({ defaultSpots: [] }));

// Mock pg with a class-based Pool
vi.mock("pg", () => {
  class MockPool {
    connect = vi.fn();
    end = vi.fn();
    query = vi.fn();
  }
  return { default: { Pool: MockPool } };
});

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => null),
}));

describe("getUserDisplayName — fallback to Skater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'Skater' when user has no username and no firstName", async () => {
    const { getUserDisplayName } = await import("../../db");

    let queryCount = 0;
    const mockDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              queryCount++;
              // First call: usernames query -> no result
              if (queryCount === 1) return Promise.resolve([]);
              // Second call: customUsers query -> firstName is null
              return Promise.resolve([{ firstName: null }]);
            }),
          })),
        })),
      })),
    };

    const result = await getUserDisplayName(mockDb, "nonexistent-user");
    expect(result).toBe("Skater");
  });

  it("returns username when available", async () => {
    const { getUserDisplayName } = await import("../../db");

    const mockDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ username: "kickflip_king" }]),
          })),
        })),
      })),
    };

    const result = await getUserDisplayName(mockDb, "user-1");
    expect(result).toBe("kickflip_king");
  });

  it("returns firstName when no username exists", async () => {
    const { getUserDisplayName } = await import("../../db");

    let queryCount = 0;
    const mockDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              queryCount++;
              if (queryCount === 1) return Promise.resolve([]);
              return Promise.resolve([{ firstName: "Tony" }]);
            }),
          })),
        })),
      })),
    };

    const result = await getUserDisplayName(mockDb, "user-2");
    expect(result).toBe("Tony");
  });
});
