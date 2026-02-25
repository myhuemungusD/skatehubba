/**
 * @fileoverview Integration tests for game management routes
 *
 * Tests:
 * - POST /:id/forfeit: voluntary forfeit (p1 + p2), not a player, game not active,
 *     game not found, db unavailable, db error (500), winnerId null branch
 * - GET /my-games: categorized game lists, db unavailable, db error (500)
 * - GET /stats/me: player stats (wins, losses, streaks, records, top tricks)
 * - GET /:id: game details with turns/disputes, isMyTurn, needsToJudge,
 *     needsToRespond, pendingTurnId, canDispute, not a player, not found,
 *     db unavailable, db error (500)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks
// =============================================================================

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

vi.mock("../../auth/middleware", () => ({
  authenticateUser: vi.fn((_req: any, _res: any, next: any) => next()),
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../../services/gameNotificationService", () => ({
  sendGameNotificationToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  or: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true, strings }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
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
    trickDescription: "trickDescription",
  },
  gameDisputes: {
    gameId: "gameId",
    createdAt: "createdAt",
  },
}));

// ---- Thenable chain mock ----
let shouldDbThrow = false;
let resultQueue: any[] = [];

function nextResult() {
  if (shouldDbThrow) throw new Error("DB boom");
  return Promise.resolve(resultQueue.length > 0 ? resultQueue.shift() : []);
}

function makeChain(): any {
  let _resolved = false;
  let _result: any;

  const chain: any = {};
  const methods = [
    "select",
    "from",
    "where",
    "limit",
    "offset",
    "orderBy",
    "groupBy",
    "set",
    "returning",
    "values",
    "insert",
    "update",
  ];

  for (const m of methods) {
    chain[m] = vi.fn().mockImplementation(() => chain);
  }

  chain.then = (resolve: Function, reject?: Function) => {
    if (!_resolved) {
      _resolved = true;
      try {
        _result = nextResult();
      } catch (err) {
        if (reject) return reject(err);
        throw err;
      }
    }
    return Promise.resolve(_result).then(resolve as any, reject as any);
  };

  return chain;
}

vi.mock("../../db", () => ({
  getDb: () => {
    if (shouldDbThrow) throw new Error("Database not configured");
    return {
      select: vi.fn().mockImplementation(() => makeChain()),
      update: vi.fn().mockImplementation(() => makeChain()),
      insert: vi.fn().mockImplementation(() => makeChain()),
    };
  },
}));

// =============================================================================
// Imports after mocks
// =============================================================================

await import("../../routes/games-management");
const { sendGameNotificationToUser } = await import("../../services/gameNotificationService");

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
    shouldDbThrow = false;
    resultQueue = [];
  });

  // ===========================================================================
  // POST /:id/forfeit
  // ===========================================================================

  describe("POST /:id/forfeit", () => {
    it("forfeits an active game as player1 — winner is player2", async () => {
      resultQueue.push(
        [{ id: "game-1", player1Id: "user-1", player2Id: "opponent-1", status: "active" }],
        [{ id: "game-1", status: "forfeited", winnerId: "opponent-1" }]
      );

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

    it("forfeits an active game as player2 — winner is player1", async () => {
      resultQueue.push(
        [{ id: "game-2", player1Id: "opponent-1", player2Id: "user-1", status: "active" }],
        [{ id: "game-2", status: "forfeited", winnerId: "opponent-1" }]
      );

      const req = mockRequest({ params: { id: "game-2" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({ status: "forfeited" }),
          message: "You forfeited.",
        })
      );
      expect(sendGameNotificationToUser).toHaveBeenCalledWith(
        "opponent-1",
        "opponent_forfeited",
        expect.any(Object)
      );
    });

    it("does not send notification when winnerId is null", async () => {
      resultQueue.push(
        [{ id: "game-3", player1Id: "user-1", player2Id: null, status: "active" }],
        [{ id: "game-3", status: "forfeited", winnerId: null }]
      );

      const req = mockRequest({ params: { id: "game-3" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(sendGameNotificationToUser).not.toHaveBeenCalled();
    });

    it("returns 403 when user is not a player in the game", async () => {
      resultQueue.push([
        { id: "game-1", player1Id: "other-1", player2Id: "other-2", status: "active" },
      ]);

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "You are not a player in this game" })
      );
    });

    it("returns 400 when game is not active", async () => {
      resultQueue.push([
        { id: "game-1", player1Id: "user-1", player2Id: "opponent-1", status: "completed" },
      ]);

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Game is not active" })
      );
    });

    it("returns 404 when game not found", async () => {
      resultQueue.push([]);

      const req = mockRequest({ params: { id: "nonexistent" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Game not found" }));
    });

    it("returns 500 when database is unavailable", async () => {
      shouldDbThrow = true;
      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to forfeit game" })
      );
    });

    it("returns 500 when db throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("POST", "/:id/forfeit", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to forfeit game" })
      );
    });
  });

  // ===========================================================================
  // GET /my-games
  // ===========================================================================

  describe("GET /my-games", () => {
    it("returns categorized games", async () => {
      resultQueue.push([
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
      ]);

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
      expect(result.completedGames).toHaveLength(3); // completed + declined + forfeited
      expect(result.total).toBe(6);
    });

    it("returns empty categories when no games", async () => {
      resultQueue.push([]);
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/my-games", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.pendingChallenges).toHaveLength(0);
      expect(result.sentChallenges).toHaveLength(0);
      expect(result.activeGames).toHaveLength(0);
      expect(result.completedGames).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("returns 500 when database is unavailable", async () => {
      shouldDbThrow = true;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/my-games", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to fetch games" })
      );
    });

    it("returns 500 when db throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/my-games", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to fetch games" })
      );
    });
  });

  // ===========================================================================
  // GET /stats/me
  // ===========================================================================

  describe("GET /stats/me", () => {
    it("returns computed stats with wins, losses, streaks, records, and tricks", async () => {
      const completed = new Date("2024-01-10");
      resultQueue.push(
        // [0] finished games
        [
          {
            id: "g1",
            winnerId: "user-1",
            player1Id: "user-1",
            player2Id: "opp-1",
            player1Name: "Me",
            player2Name: "Opp1",
            completedAt: completed,
          },
          {
            id: "g2",
            winnerId: "user-1",
            player1Id: "user-1",
            player2Id: "opp-1",
            player1Name: "Me",
            player2Name: "Opp1",
            completedAt: completed,
          },
          {
            id: "g3",
            winnerId: "opp-1",
            player1Id: "user-1",
            player2Id: "opp-1",
            player1Name: "Me",
            player2Name: "Opp1",
            completedAt: completed,
          },
        ],
        // [1] trick stats
        [
          { trick: "Kickflip", count: 5 },
          { trick: "Heelflip", count: 3 },
        ]
      );

      const req = mockRequest();
      const res = mockResponse();
      await callRoute("GET", "/stats/me", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.totalGames).toBe(3);
      expect(result.wins).toBe(2);
      expect(result.losses).toBe(1);
      expect(result.winRate).toBe(67);
      expect(result.currentStreak).toBe(2);
      expect(result.bestStreak).toBe(2);
      expect(result.opponentRecords).toHaveLength(1);
      expect(result.opponentRecords[0].wins).toBe(2);
      expect(result.opponentRecords[0].losses).toBe(1);
      expect(result.topTricks).toEqual([
        { trick: "Kickflip", count: 5 },
        { trick: "Heelflip", count: 3 },
      ]);
      expect(result.recentGames).toHaveLength(3);
    });

    it("returns zero stats when no finished games", async () => {
      resultQueue.push([], []);

      const req = mockRequest();
      const res = mockResponse();
      await callRoute("GET", "/stats/me", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.totalGames).toBe(0);
      expect(result.wins).toBe(0);
      expect(result.losses).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.currentStreak).toBe(0);
      expect(result.bestStreak).toBe(0);
      expect(result.opponentRecords).toHaveLength(0);
      expect(result.topTricks).toHaveLength(0);
      expect(result.recentGames).toHaveLength(0);
    });

    it("computes bestStreak across non-consecutive wins", async () => {
      const completed = new Date("2024-01-10");
      resultQueue.push(
        [
          {
            id: "g1",
            winnerId: "opp-1",
            player1Id: "user-1",
            player2Id: "opp-1",
            player1Name: "Me",
            player2Name: "Opp",
            completedAt: completed,
          },
          {
            id: "g2",
            winnerId: "user-1",
            player1Id: "user-1",
            player2Id: "opp-1",
            player1Name: "Me",
            player2Name: "Opp",
            completedAt: completed,
          },
          {
            id: "g3",
            winnerId: "user-1",
            player1Id: "user-1",
            player2Id: "opp-1",
            player1Name: "Me",
            player2Name: "Opp",
            completedAt: completed,
          },
          {
            id: "g4",
            winnerId: "user-1",
            player1Id: "user-1",
            player2Id: "opp-1",
            player1Name: "Me",
            player2Name: "Opp",
            completedAt: completed,
          },
        ],
        []
      );

      const req = mockRequest();
      const res = mockResponse();
      await callRoute("GET", "/stats/me", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.currentStreak).toBe(0); // first game is a loss
      expect(result.bestStreak).toBe(3); // g2, g3, g4
    });

    it("skips opponent with null opponentId", async () => {
      resultQueue.push(
        [
          {
            id: "g1",
            winnerId: "user-1",
            player1Id: "user-1",
            player2Id: null,
            player1Name: "Me",
            player2Name: null,
            completedAt: new Date(),
          },
        ],
        []
      );

      const req = mockRequest();
      const res = mockResponse();
      await callRoute("GET", "/stats/me", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.opponentRecords).toHaveLength(0);
    });

    it("uses default name when opponentName is null", async () => {
      resultQueue.push(
        [
          {
            id: "g1",
            winnerId: "user-1",
            player1Id: "opp-1",
            player2Id: "user-1",
            player1Name: null,
            player2Name: "Me",
            completedAt: new Date(),
          },
        ],
        []
      );

      const req = mockRequest();
      const res = mockResponse();
      await callRoute("GET", "/stats/me", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.opponentRecords[0].name).toBe("Skater");
    });

    it("returns 500 when database is unavailable", async () => {
      shouldDbThrow = true;
      const req = mockRequest();
      const res = mockResponse();
      await callRoute("GET", "/stats/me", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to fetch stats" })
      );
    });
  });

  // ===========================================================================
  // GET /:id
  // ===========================================================================

  describe("GET /:id", () => {
    it("returns full game details with turns, disputes, and flags", async () => {
      resultQueue.push(
        [
          {
            id: "game-1",
            player1Id: "user-1",
            player2Id: "opponent-1",
            status: "active",
            currentTurn: "user-1",
            turnPhase: "set",
            player1DisputeUsed: false,
            player2DisputeUsed: false,
          },
        ],
        [
          { id: 10, turnNumber: 1, result: "landed", turnType: "set", playerId: "user-1" },
          { id: 11, turnNumber: 2, result: "pending", turnType: "set", playerId: "opponent-1" },
        ],
        [{ id: 20, gameId: "game-1", createdAt: new Date() }]
      );

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.game.id).toBe("game-1");
      expect(result.turns).toHaveLength(2);
      expect(result.disputes).toHaveLength(1);
      expect(result.isMyTurn).toBe(true);
      expect(result.canDispute).toBe(true);
    });

    it("sets needsToJudge and pendingTurnId when turnPhase is judge", async () => {
      resultQueue.push(
        [
          {
            id: "game-1",
            player1Id: "user-1",
            player2Id: "opponent-1",
            status: "active",
            currentTurn: "user-1",
            turnPhase: "judge",
            player1DisputeUsed: false,
            player2DisputeUsed: false,
          },
        ],
        [{ id: 15, turnNumber: 1, result: "pending", turnType: "set", playerId: "opponent-1" }],
        []
      );

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.needsToJudge).toBe(true);
      expect(result.pendingTurnId).toBe(15);
    });

    it("sets needsToRespond when turnPhase is respond_trick", async () => {
      resultQueue.push(
        [
          {
            id: "game-1",
            player1Id: "opponent-1",
            player2Id: "user-1",
            status: "active",
            currentTurn: "user-1",
            turnPhase: "respond_trick",
            player1DisputeUsed: false,
            player2DisputeUsed: true,
          },
        ],
        [],
        []
      );

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.needsToRespond).toBe(true);
      expect(result.isMyTurn).toBe(true);
      expect(result.canDispute).toBe(false); // player2 dispute used
    });

    it("sets isMyTurn false and canDispute for player1 with unused dispute", async () => {
      resultQueue.push(
        [
          {
            id: "game-1",
            player1Id: "user-1",
            player2Id: "opponent-1",
            status: "active",
            currentTurn: "opponent-1",
            turnPhase: "set",
            player1DisputeUsed: false,
            player2DisputeUsed: true,
          },
        ],
        [],
        []
      );

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.isMyTurn).toBe(false);
      expect(result.canDispute).toBe(true);
      expect(result.needsToJudge).toBe(false);
      expect(result.needsToRespond).toBe(false);
      expect(result.pendingTurnId).toBeNull();
    });

    it("sets canDispute false for player1 when dispute already used", async () => {
      resultQueue.push(
        [
          {
            id: "game-1",
            player1Id: "user-1",
            player2Id: "opponent-1",
            status: "active",
            currentTurn: "user-1",
            turnPhase: "set",
            player1DisputeUsed: true,
            player2DisputeUsed: false,
          },
        ],
        [],
        []
      );

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.canDispute).toBe(false);
    });

    it("returns 403 when user is not a player", async () => {
      resultQueue.push([
        { id: "game-1", player1Id: "other-1", player2Id: "other-2", status: "active" },
      ]);

      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "You are not a player in this game" })
      );
    });

    it("returns 404 when game not found", async () => {
      resultQueue.push([]);

      const req = mockRequest({ params: { id: "nonexistent" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Game not found" }));
    });

    it("returns 500 when database is unavailable", async () => {
      shouldDbThrow = true;
      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to fetch game" })
      );
    });

    it("returns 500 when db throws", async () => {
      shouldDbThrow = true;
      const req = mockRequest({ params: { id: "game-1" } });
      const res = mockResponse();

      await callRoute("GET", "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to fetch game" })
      );
    });
  });
});
