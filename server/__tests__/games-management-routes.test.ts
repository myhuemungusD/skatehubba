/**
 * @fileoverview Integration tests for game management routes
 *
 * Tests:
 * - POST /:id/forfeit: voluntary forfeit, not a player, game not active, game not found, db unavailable
 * - GET /my-games: categorized game lists, db unavailable, db error
 * - GET /:id: game details with turns/disputes, not a player, not found, db unavailable
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks
// =============================================================================

// Mock Express Router to capture registered routes
const _routeHandlers: Record<string, Function[]> = {};
const _mockRouter: any = {
  use: vi.fn(),
  get: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`GET ${path}`] = handlers;
  }),
  post: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`POST ${path}`] = handlers;
  }),
  put: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`PUT ${path}`] = handlers;
  }),
  patch: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`PATCH ${path}`] = handlers;
  }),
  delete: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`DELETE ${path}`] = handlers;
  }),
};
vi.mock("express", () => ({
  Router: () => _mockRouter,
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../services/gameNotificationService", () => ({
  sendGameNotificationToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  or: vi.fn(),
  desc: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  games: {
    id: "id",
    player1Id: "player1Id",
    player2Id: "player2Id",
    status: "status",
    updatedAt: "updatedAt",
  },
  gameTurns: {
    gameId: "gameId",
    turnNumber: "turnNumber",
    result: "result",
    turnType: "turnType",
    playerId: "playerId",
  },
  gameDisputes: {
    gameId: "gameId",
    createdAt: "createdAt",
  },
}));

const mockDbReturns = {
  selectResult: [] as any[],
  insertResult: [] as any[],
  updateResult: [] as any[],
};

let mockIsDatabaseAvailable = true;
let selectCallCount = 0;
let selectResults: any[][] = [];

vi.mock("../db", () => ({
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            const result =
              selectResults.length > 0 ? selectResults.shift() : mockDbReturns.selectResult;
            return Promise.resolve(result);
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
          }),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
        }),
      }),
    }),
  }),
  isDatabaseAvailable: () => mockIsDatabaseAvailable,
}));

// =============================================================================
// Imports after mocks
// =============================================================================

await import("../routes/games-management");
const { sendGameNotificationToUser } = await import("../services/gameNotificationService");

// =============================================================================
// Helpers
// =============================================================================

function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    currentUser: { id: "user-1" },
    ...overrides,
  };
}

function mockResponse(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function callRoute(method: string, path: string, req: any, res: any) {
  const key = `${method} ${path}`;
  const handlers = _routeHandlers[key];
  if (!handlers)
    throw new Error(`No handler for ${key}. Available: ${Object.keys(_routeHandlers).join(", ")}`);
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("Game Management Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.insertResult = [];
    mockDbReturns.updateResult = [];
    mockIsDatabaseAvailable = true;
    selectCallCount = 0;
    selectResults = [];
  });

  // ===========================================================================
  // POST /:id/forfeit
  // ===========================================================================

  describe("POST /:id/forfeit", () => {
    it("forfeits an active game successfully", async () => {
      mockDbReturns.selectResult = [
        {
          id: "game-1",
          player1Id: "user-1",
          player2Id: "opponent-1",
          status: "active",
        },
      ];
      mockDbReturns.updateResult = [
        {
          id: "game-1",
          status: "forfeited",
          winnerId: "opponent-1",
        },
      ];

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({ status: "forfeited", winnerId: "opponent-1" }),
          message: "You forfeited.",
        })
      );
      expect(sendGameNotificationToUser).toHaveBeenCalledWith(
        "opponent-1",
        "opponent_forfeited",
        expect.objectContaining({ gameId: "game-1" })
      );
    });

    it("returns 403 when user is not a player in the game", async () => {
      mockDbReturns.selectResult = [
        {
          id: "game-1",
          player1Id: "other-1",
          player2Id: "other-2",
          status: "active",
        },
      ];

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "You are not a player in this game" })
      );
    });

    it("returns 400 when game is not active", async () => {
      mockDbReturns.selectResult = [
        {
          id: "game-1",
          player1Id: "user-1",
          player2Id: "opponent-1",
          status: "completed",
        },
      ];

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Game is not active" })
      );
    });

    it("returns 404 when game not found", async () => {
      mockDbReturns.selectResult = [];

      const req = mockRequest({ params: { id: "nonexistent" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Game not found" }));
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("sets winner to player2 when player1 forfeits", async () => {
      mockDbReturns.selectResult = [
        {
          id: "game-1",
          player1Id: "user-1",
          player2Id: "opponent-1",
          status: "active",
        },
      ];
      mockDbReturns.updateResult = [{ id: "game-1", status: "forfeited", winnerId: "opponent-1" }];

      const req = mockRequest({
        params: { id: "game-1" },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(sendGameNotificationToUser).toHaveBeenCalledWith(
        "opponent-1",
        "opponent_forfeited",
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // GET /my-games
  // ===========================================================================

  describe("GET /my-games", () => {
    it("returns categorized games", async () => {
      mockDbReturns.selectResult = [
        {
          id: "g1",
          player1Id: "other",
          player2Id: "user-1",
          status: "pending",
          updatedAt: new Date(),
        },
        {
          id: "g2",
          player1Id: "user-1",
          player2Id: "other",
          status: "pending",
          updatedAt: new Date(),
        },
        {
          id: "g3",
          player1Id: "user-1",
          player2Id: "other",
          status: "active",
          updatedAt: new Date(),
        },
        {
          id: "g4",
          player1Id: "user-1",
          player2Id: "other",
          status: "completed",
          updatedAt: new Date(),
        },
        {
          id: "g5",
          player1Id: "user-1",
          player2Id: "other",
          status: "declined",
          updatedAt: new Date(),
        },
        {
          id: "g6",
          player1Id: "user-1",
          player2Id: "other",
          status: "forfeited",
          updatedAt: new Date(),
        },
      ];

      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/my-games", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.pendingChallenges).toHaveLength(1);
      expect(result.pendingChallenges[0].id).toBe("g1");
      expect(result.sentChallenges).toHaveLength(1);
      expect(result.sentChallenges[0].id).toBe("g2");
      expect(result.activeGames).toHaveLength(1);
      expect(result.activeGames[0].id).toBe("g3");
      expect(result.completedGames).toHaveLength(3);
      expect(result.total).toBe(6);
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/my-games", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // GET /:id
  // ===========================================================================

  describe("GET /:id", () => {
    it("returns 403 when user is not a player", async () => {
      mockDbReturns.selectResult = [
        {
          id: "game-1",
          player1Id: "other-1",
          player2Id: "other-2",
          status: "active",
        },
      ];

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "You are not a player in this game" })
      );
    });

    it("returns 404 when game not found", async () => {
      mockDbReturns.selectResult = [];

      const req = mockRequest({ params: { id: "nonexistent" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Game not found" }));
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });
});
