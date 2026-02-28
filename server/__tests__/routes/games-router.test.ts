/**
 * @fileoverview Unit tests for the main games router aggregator
 */

import { describe, it, expect, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockRouter: any = {
  use: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("express", () => ({
  Router: () => mockRouter,
}));

vi.mock("../../routes/games-challenges", () => ({
  gamesChallengesRouter: { _name: "challenges" },
}));

vi.mock("../../routes/games-turns", () => ({
  gamesTurnsRouter: { _name: "turns" },
}));

vi.mock("../../routes/games-disputes", () => ({
  gamesDisputesRouter: { _name: "disputes" },
}));

vi.mock("../../routes/games-management", () => ({
  gamesManagementRouter: { _name: "management" },
}));

vi.mock("../../routes/games-cron", () => ({
  forfeitExpiredGames: vi.fn(),
  notifyDeadlineWarnings: vi.fn(),
}));

vi.mock("../../middleware/security", () => ({
  gameWriteLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
}));

const { gamesRouter, forfeitExpiredGames, notifyDeadlineWarnings } =
  await import("../../routes/games");

// ============================================================================
// Tests
// ============================================================================

describe("Games Router", () => {
  it("should export gamesRouter", () => {
    expect(gamesRouter).toBeDefined();
  });

  it("should mount sub-routers via use()", () => {
    // 4 sub-routers + 1 rate-limit middleware
    expect(mockRouter.use).toHaveBeenCalledTimes(5);
  });

  it("should re-export cron functions", () => {
    expect(forfeitExpiredGames).toBeDefined();
    expect(notifyDeadlineWarnings).toBeDefined();
  });

  it("should skip rate limiter for GET requests", () => {
    // The first router.use() call registers the rate-limit middleware
    const rateLimitMiddleware = mockRouter.use.mock.calls[0][0];
    const next = vi.fn();
    rateLimitMiddleware({ method: "GET" }, {}, next);
    expect(next).toHaveBeenCalled();
  });

  it("should apply rate limiter for non-GET requests", async () => {
    const { gameWriteLimiter } = await import("../../middleware/security");
    const rateLimitMiddleware = mockRouter.use.mock.calls[0][0];
    const next = vi.fn();
    const req = { method: "POST" };
    const res = {};
    rateLimitMiddleware(req, res, next);
    expect(gameWriteLimiter).toHaveBeenCalledWith(req, res, next);
  });
});
