/**
 * @fileoverview Unit tests for server/routes/stats.ts (statsRouter)
 *
 * Tests GET /api/stats — public stats for the landing page
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../db", () => ({
  getDb: vi.fn(),
  isDatabaseAvailable: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  customUsers: { _table: "customUsers" },
  spots: { _table: "spots" },
  games: { _table: "games" },
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(() => "count_agg"),
}));

// Capture route handlers via mock Router
const routeHandlers: Record<string, any[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    get: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`GET ${path}`] = handlers;
    }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../routes/stats");

const { getDb, isDatabaseAvailable } = await import("../db");

// ============================================================================
// Helpers
// ============================================================================

function mockReq() {
  return {};
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function callHandler(routeKey: string, req: any, res: any) {
  const handlers = routeHandlers[routeKey];
  if (!handlers) throw new Error(`Route ${routeKey} not registered`);
  const handler = handlers[handlers.length - 1];
  await handler(req, res);
}

// ============================================================================
// Tests
// ============================================================================

describe("GET /api/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return aggregated stats with distinct counts per table", async () => {
    vi.mocked(isDatabaseAvailable).mockReturnValue(true);

    const { customUsers, spots, games } = await import("@shared/schema");
    const fromMock = vi.fn().mockImplementation((table: any) => {
      if (table === customUsers) return Promise.resolve([{ count: 10 }]);
      if (table === spots) return Promise.resolve([{ count: 25 }]);
      if (table === games) return Promise.resolve([{ count: 7 }]);
      return Promise.resolve([{ count: 0 }]);
    });
    const mockDb = {
      select: vi.fn().mockReturnValue({ from: fromMock }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const req = mockReq();
    const res = mockRes();
    await callHandler("GET /", req, res);

    expect(fromMock).toHaveBeenCalledWith(customUsers);
    expect(fromMock).toHaveBeenCalledWith(spots);
    expect(fromMock).toHaveBeenCalledWith(games);
    expect(res.json).toHaveBeenCalledWith({
      totalUsers: 10,
      totalSpots: 25,
      totalBattles: 7,
    });
  });

  it("should return zero stats when db is unavailable", async () => {
    vi.mocked(isDatabaseAvailable).mockReturnValue(false);

    const req = mockReq();
    const res = mockRes();
    await callHandler("GET /", req, res);

    expect(res.json).toHaveBeenCalledWith({
      totalUsers: 0,
      totalSpots: 0,
      totalBattles: 0,
    });
  });

  it("should return zero stats on error", async () => {
    vi.mocked(isDatabaseAvailable).mockReturnValue(true);
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("kaboom");
    });

    const req = mockReq();
    const res = mockRes();
    await callHandler("GET /", req, res);

    expect(res.json).toHaveBeenCalledWith({
      totalUsers: 0,
      totalSpots: 0,
      totalBattles: 0,
    });
  });

  it("should handle empty count results gracefully", async () => {
    vi.mocked(isDatabaseAvailable).mockReturnValue(true);
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([{}]),
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const req = mockReq();
    const res = mockRes();
    await callHandler("GET /", req, res);

    expect(res.json).toHaveBeenCalledWith({
      totalUsers: 0,
      totalSpots: 0,
      totalBattles: 0,
    });
  });
});
