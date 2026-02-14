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

vi.mock("../routes/games-challenges", () => ({
  gamesChallengesRouter: { _name: "challenges" },
}));

vi.mock("../routes/games-turns", () => ({
  gamesTurnsRouter: { _name: "turns" },
}));

vi.mock("../routes/games-disputes", () => ({
  gamesDisputesRouter: { _name: "disputes" },
}));

vi.mock("../routes/games-management", () => ({
  gamesManagementRouter: { _name: "management" },
}));

vi.mock("../routes/games-cron", () => ({
  forfeitExpiredGames: vi.fn(),
  notifyDeadlineWarnings: vi.fn(),
}));

const { gamesRouter, forfeitExpiredGames, notifyDeadlineWarnings } =
  await import("../routes/games");

// ============================================================================
// Tests
// ============================================================================

describe("Games Router", () => {
  it("should export gamesRouter", () => {
    expect(gamesRouter).toBeDefined();
  });

  it("should mount sub-routers via use()", () => {
    expect(mockRouter.use).toHaveBeenCalledTimes(4);
  });

  it("should re-export cron functions", () => {
    expect(forfeitExpiredGames).toBeDefined();
    expect(notifyDeadlineWarnings).toBeDefined();
  });
});
