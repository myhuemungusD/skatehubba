/**
 * @fileoverview Unit tests for S.K.A.T.E. Game Turn Routes
 *
 * Tests route handlers directly by capturing Express router registrations.
 *
 * POST /:id/turns — Submit a turn (set trick or response)
 * POST /turns/:turnId/judge — Judge a turn (LAND or BAIL)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

const mockTransaction = vi.fn();
const mockOuterSelect = vi.fn();
const mockSendGameNotification = vi.fn().mockResolvedValue(undefined);
let shouldGetDbThrow = false;

// Capture route registrations via the Router mock
const capturedRoutes: any[] = [];

vi.mock("express", () => ({
  Router: () => {
    const mockRouter: any = {};
    for (const method of ["get", "post", "put", "patch", "delete", "use"]) {
      mockRouter[method] = vi.fn((...args: any[]) => {
        capturedRoutes.push({ method, args });
        return mockRouter;
      });
    }
    return mockRouter;
  },
}));

vi.mock("../../db", () => ({
  getDb: () => {
    if (shouldGetDbThrow) throw new Error("Database not configured");
    return {
      select: mockOuterSelect,
      transaction: mockTransaction,
    };
  },
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1" };
    next();
  },
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
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

vi.mock("../../services/gameNotificationService", () => ({
  sendGameNotificationToUser: mockSendGameNotification,
}));

vi.mock("@shared/schema", () => ({
  games: { _table: "games", id: { name: "id" } },
  gameTurns: {
    _table: "gameTurns",
    id: { name: "id" },
    gameId: { name: "gameId" },
    playerId: { name: "playerId" },
    turnType: { name: "turnType" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
  and: (...conditions: any[]) => ({ _op: "and", conditions }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true, strings }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

vi.mock("../../routes/games-shared", () => ({
  submitTurnSchema: {
    safeParse: (body: any) => {
      if (
        !body ||
        !body.trickDescription ||
        !body.videoUrl ||
        typeof body.videoDurationMs !== "number"
      ) {
        return { success: false, error: { flatten: () => ({ fieldErrors: {} }) } };
      }
      return {
        success: true,
        data: {
          trickDescription: body.trickDescription,
          videoUrl: body.videoUrl,
          videoDurationMs: body.videoDurationMs,
          thumbnailUrl: body.thumbnailUrl || undefined,
        },
      };
    },
  },
  judgeTurnSchema: {
    safeParse: (body: any) => {
      if (!body || !["landed", "missed"].includes(body.result)) {
        return { success: false, error: { flatten: () => ({ fieldErrors: {} }) } };
      }
      return { success: true, data: { result: body.result } };
    },
  },
  MAX_VIDEO_DURATION_MS: 15000,
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
  SKATE_LETTERS: "SKATE",
  isGameOver: (p1Letters: string, p2Letters: string) => {
    if (p1Letters.length >= 5) return { over: true, loserId: "player1" };
    if (p2Letters.length >= 5) return { over: true, loserId: "player2" };
    return { over: false, loserId: null };
  },
}));

// ============================================================================
// Import the module (triggers route registration into capturedRoutes)
// ============================================================================

await import("../../routes/games-turns");

// ============================================================================
// Helpers
// ============================================================================

function createReq(overrides: Record<string, any> = {}) {
  return {
    currentUser: { id: "user-1" },
    params: {},
    body: {},
    ...overrides,
  };
}

function createRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function callHandler(method: string, path: string, req: any, res: any) {
  const route = capturedRoutes.find((r) => r.method === method && r.args[0] === path);
  if (!route) {
    throw new Error(
      `Route ${method.toUpperCase()} ${path} not found. Available: ${capturedRoutes
        .map((r) => `${r.method.toUpperCase()} ${r.args[0]}`)
        .join(", ")}`
    );
  }
  const handlers = route.args.slice(1);
  for (const handler of handlers) {
    await handler(req, res, vi.fn());
  }
}

/**
 * Creates a mock transaction tx object.
 *
 * selectResults: array of arrays — each tx.select() call consumes the next entry.
 * insertResult: array returned by insert().values().returning().
 * updateResults: array of arrays — each tx.update() call consumes the next entry.
 */
function createTx(
  config: {
    selectResults?: any[][];
    insertResult?: any[];
    updateResults?: any[][];
  } = {}
) {
  const tx: any = {};
  let selectIdx = 0;
  let updateIdx = 0;

  tx.execute = vi.fn().mockResolvedValue(undefined);

  tx.select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation(() => {
      const idx = selectIdx++;
      const result = config.selectResults?.[idx] || [];
      return {
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockResolvedValue(result),
          then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
        })),
        then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
      };
    }),
  }));

  tx.insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation(() => ({
      returning: vi.fn().mockResolvedValue(config.insertResult || []),
    })),
  }));

  tx.update = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation(() => {
      const idx = updateIdx++;
      const result = config.updateResults?.[idx] || [];
      return {
        where: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue(result),
          then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
        })),
      };
    }),
  }));

  return tx;
}

/**
 * Configures the outer db.select() chain (used by the judge route to look up
 * the turn outside its transaction).
 */
function setupOuterSelect(result: any[]) {
  mockOuterSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
        then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
      }),
    }),
  });
}

// ============================================================================
// Shared test fixtures
// ============================================================================

const validTurnBody = {
  trickDescription: "Kickflip",
  videoUrl: "https://example.com/video.mp4",
  videoDurationMs: 5000,
};

const baseActiveGame = {
  id: "game-1",
  player1Id: "user-1",
  player2Id: "user-2",
  player1Name: "Alice",
  player2Name: "Bob",
  status: "active",
  currentTurn: "user-1",
  deadlineAt: new Date(Date.now() + 100000),
  turnPhase: "set_trick",
  offensivePlayerId: "user-1",
  defensivePlayerId: "user-2",
  player1Letters: "",
  player2Letters: "",
};

const baseTurn = {
  id: 1,
  gameId: "game-1",
  playerId: "user-2",
  turnNumber: 1,
  turnType: "set",
  trickDescription: "Kickflip",
  videoUrl: "https://example.com/video.mp4",
  result: "pending",
};

const judgeGameBase = {
  id: "game-1",
  player1Id: "user-1",
  player2Id: "user-2",
  player1Name: "Alice",
  player2Name: "Bob",
  status: "active",
  offensivePlayerId: "user-2",
  defensivePlayerId: "user-1",
  turnPhase: "judge",
  currentTurn: "user-1",
  player1Letters: "",
  player2Letters: "",
};

// ============================================================================
// Tests
// ============================================================================

describe("Game Turn Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldGetDbThrow = false;
    setupOuterSelect([]);
  });

  // ==========================================================================
  // POST /:id/turns — Submit Turn
  // ==========================================================================

  describe("POST /:id/turns", () => {
    it("returns 500 when database is unavailable", async () => {
      shouldGetDbThrow = true;

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to submit turn" });
    });

    it("returns 400 for invalid body", async () => {
      const req = createReq({ params: { id: "game-1" }, body: {} });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request" }));
    });

    it("returns 400 when video exceeds 15 second limit", async () => {
      const req = createReq({
        params: { id: "game-1" },
        body: { ...validTurnBody, videoDurationMs: 20000 },
      });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Video exceeds 15 second limit",
      });
    });

    it("returns 404 when game is not found", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({ selectResults: [[]] });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Game not found" });
    });

    it("returns 403 when user is not a player", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [
              {
                ...baseActiveGame,
                player1Id: "other-1",
                player2Id: "other-2",
              },
            ],
          ],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You are not a player in this game",
      });
    });

    it("returns 400 when game is not active", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [[{ ...baseActiveGame, status: "completed" }]],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Game is not active" });
    });

    it("returns 400 when it is not the user's turn", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [[{ ...baseActiveGame, currentTurn: "user-2" }]],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Not your turn" });
    });

    it("returns 400 when turn deadline has passed", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [
              {
                ...baseActiveGame,
                deadlineAt: new Date(Date.now() - 1000),
              },
            ],
          ],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Turn deadline has passed. Game forfeited.",
      });
    });

    it("returns 400 when phase does not accept video submissions", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [
              {
                ...baseActiveGame,
                turnPhase: "judge",
              },
            ],
          ],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Current phase does not accept video submissions",
      });
    });

    it("creates turn and sends notification on set trick success", async () => {
      const newTurn = {
        id: 10,
        gameId: "game-1",
        playerId: "user-1",
        turnType: "set",
        trickDescription: "Kickflip",
        videoUrl: "https://example.com/video.mp4",
        turnNumber: 1,
      };

      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          // [0] game lookup, [1] turn count
          selectResults: [[{ ...baseActiveGame }], [{ count: 0 }]],
          insertResult: [newTurn],
          updateResults: [[]],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          turn: newTurn,
          message: "Trick set. Sent.",
        })
      );
      // Should notify the defensive player
      expect(mockSendGameNotification).toHaveBeenCalledWith("user-2", "your_turn", {
        gameId: "game-1",
        opponentName: "Alice",
        trickName: "Kickflip",
      });
    });

    it("creates turn and updates to judge phase on response success", async () => {
      const newTurn = {
        id: 11,
        gameId: "game-1",
        playerId: "user-1",
        turnType: "response",
        trickDescription: "Kickflip",
        turnNumber: 2,
      };

      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          // [0] game lookup, [1] turn count
          selectResults: [
            [
              {
                ...baseActiveGame,
                player1Id: "user-2",
                player2Id: "user-1",
                player1Name: "Bob",
                player2Name: "Alice",
                turnPhase: "respond_trick",
                offensivePlayerId: "user-2",
                defensivePlayerId: "user-1",
                currentTurn: "user-1",
              },
            ],
            [{ count: 1 }],
          ],
          insertResult: [newTurn],
          updateResults: [[]],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          turn: newTurn,
          message: "Response sent. Now judge the trick.",
        })
      );
      // Response submissions do not send notifications (notify is null)
      expect(mockSendGameNotification).not.toHaveBeenCalled();
    });

    it("returns 500 on unexpected error", async () => {
      mockTransaction.mockRejectedValue(new Error("DB crash"));

      const req = createReq({ params: { id: "game-1" }, body: validTurnBody });
      const res = createRes();

      await callHandler("post", "/:id/turns", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to submit turn",
      });
    });
  });

  // ==========================================================================
  // POST /turns/:turnId/judge — Judge Turn
  // ==========================================================================

  describe("POST /turns/:turnId/judge", () => {
    it("returns 500 when database is unavailable", async () => {
      shouldGetDbThrow = true;

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to judge turn" });
    });

    it("returns 400 for invalid body", async () => {
      const req = createReq({
        params: { turnId: "1" },
        body: { result: "invalid" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request" }));
    });

    it("returns 400 for invalid turn ID (NaN)", async () => {
      const req = createReq({
        params: { turnId: "abc" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid turn ID" });
    });

    it("returns 400 for turnId=0 (turnId <= 0 branch, line 101)", async () => {
      const req = createReq({
        params: { turnId: "0" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid turn ID" });
    });

    it("returns 404 when turn is not found", async () => {
      setupOuterSelect([]);

      const req = createReq({
        params: { turnId: "999" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Turn not found" });
    });

    it("returns 404 when game is not found", async () => {
      setupOuterSelect([baseTurn]);
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [[]], // game lookup returns empty
        });
        return callback(tx);
      });

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Game not found" });
    });

    it("returns 403 when user is not the defending player", async () => {
      setupOuterSelect([baseTurn]);
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [
              {
                ...judgeGameBase,
                defensivePlayerId: "user-2", // not user-1
                offensivePlayerId: "user-1",
              },
            ],
          ],
        });
        return callback(tx);
      });

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Only the defending player can judge",
      });
    });

    it("returns 400 when game is not in judging phase", async () => {
      setupOuterSelect([baseTurn]);
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [
              {
                ...judgeGameBase,
                turnPhase: "set_trick", // not "judge"
              },
            ],
          ],
        });
        return callback(tx);
      });

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Game is not in judging phase",
      });
    });

    it("returns 400 when it is not the user's turn to judge", async () => {
      setupOuterSelect([baseTurn]);
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [
              {
                ...judgeGameBase,
                currentTurn: "user-2", // not user-1
              },
            ],
          ],
        });
        return callback(tx);
      });

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Not your turn to judge",
      });
    });

    it("returns 400 when turn has already been judged", async () => {
      setupOuterSelect([baseTurn]);
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [judgeGameBase], // [0] game lookup
            [{ ...baseTurn, result: "landed" }], // [1] turn re-check (already judged)
          ],
        });
        return callback(tx);
      });

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "missed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Turn has already been judged",
      });
    });

    it("returns 400 when no response video has been submitted", async () => {
      setupOuterSelect([baseTurn]);
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [judgeGameBase], // [0] game lookup
            [baseTurn], // [1] turn re-check (pending)
            [], // [2] response videos (none found)
          ],
        });
        return callback(tx);
      });

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "missed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "You must submit your response video before judging",
      });
    });

    it("handles missed judgment with letter earned and game continues", async () => {
      const updatedGame = {
        ...judgeGameBase,
        player1Letters: "S",
        player2Letters: "",
        currentTurn: "user-2",
        turnPhase: "set_trick",
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
      };

      setupOuterSelect([baseTurn]);
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [judgeGameBase], // [0] game lookup
            [baseTurn], // [1] turn re-check (pending)
            [
              // [2] response videos
              { turnNumber: 2, playerId: "user-1", turnType: "response" },
            ],
          ],
          updateResults: [
            [], // [0] turn result update (no returning)
            [updatedGame], // [1] game update (with returning)
          ],
        });
        return callback(tx);
      });

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "missed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      // Should return the response with game and turn data
      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.game).toEqual(updatedGame);
      expect(responseBody.gameOver).toBe(false);
      expect(responseBody.message).toBe("BAIL. Letter earned.");
      expect(responseBody.turn.result).toBe("missed");
      expect(responseBody.turn.judgedBy).toBe("user-1");

      // Notification sent to the offensive player
      expect(mockSendGameNotification).toHaveBeenCalledWith(
        "user-2",
        "your_turn",
        expect.objectContaining({ gameId: "game-1" })
      );
    });

    it("handles landed judgment with roles swap", async () => {
      const updatedGame = {
        ...judgeGameBase,
        player1Letters: "",
        player2Letters: "",
        currentTurn: "user-1",
        turnPhase: "set_trick",
        offensivePlayerId: "user-1",
        defensivePlayerId: "user-2",
      };

      setupOuterSelect([baseTurn]);
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [judgeGameBase], // [0] game lookup
            [baseTurn], // [1] turn re-check (pending)
            [
              // [2] response videos
              { turnNumber: 2, playerId: "user-1", turnType: "response" },
            ],
          ],
          updateResults: [
            [], // [0] turn result update (no returning)
            [updatedGame], // [1] game update (with returning)
          ],
        });
        return callback(tx);
      });

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.game).toEqual(updatedGame);
      expect(responseBody.gameOver).toBe(false);
      expect(responseBody.message).toBe("LAND. Roles swap.");
      expect(responseBody.turn.result).toBe("landed");
      expect(responseBody.turn.judgedBy).toBe("user-1");

      // Notification sent to the new offensive player (previously defensive)
      expect(mockSendGameNotification).toHaveBeenCalledWith(
        "user-1",
        "your_turn",
        expect.objectContaining({ gameId: "game-1" })
      );
    });

    it("returns game over response and sends notifications when game ends", async () => {
      const gameWithLetters = {
        ...judgeGameBase,
        player1Letters: "SKAT", // one letter away from losing
        player2Letters: "",
      };

      const completedGame = {
        ...gameWithLetters,
        player1Letters: "SKATE",
        status: "completed",
        winnerId: "user-2",
        turnPhase: null,
        currentTurn: null,
        deadlineAt: null,
      };

      setupOuterSelect([baseTurn]);
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [
            [gameWithLetters], // [0] game lookup
            [baseTurn], // [1] turn re-check (pending)
            [
              // [2] response videos
              { turnNumber: 2, playerId: "user-1", turnType: "response" },
            ],
          ],
          updateResults: [
            [], // [0] turn result update (no returning)
            [completedGame], // [1] game update (with returning)
          ],
        });
        return callback(tx);
      });

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "missed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.game).toEqual(completedGame);
      expect(responseBody.gameOver).toBe(true);
      expect(responseBody.winnerId).toBe("user-2");
      expect(responseBody.message).toBe("Game over.");
      expect(responseBody.turn.result).toBe("missed");

      // Both players receive game_over notifications
      expect(mockSendGameNotification).toHaveBeenCalledTimes(2);
      expect(mockSendGameNotification).toHaveBeenCalledWith(
        "user-1",
        "game_over",
        expect.objectContaining({
          gameId: "game-1",
          winnerId: "user-2",
          youWon: false,
        })
      );
      expect(mockSendGameNotification).toHaveBeenCalledWith(
        "user-2",
        "game_over",
        expect.objectContaining({
          gameId: "game-1",
          winnerId: "user-2",
          youWon: true,
        })
      );
    });

    it("returns 500 on unexpected error", async () => {
      setupOuterSelect([baseTurn]);
      mockTransaction.mockRejectedValue(new Error("DB crash"));

      const req = createReq({
        params: { turnId: "1" },
        body: { result: "landed" },
      });
      const res = createRes();

      await callHandler("post", "/turns/:turnId/judge", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to judge turn",
      });
    });
  });

  // ==========================================================================
  // POST /:id/setter-bail
  // ==========================================================================

  describe("POST /:id/setter-bail", () => {
    it("returns game data on successful bail (no game over)", async () => {
      const updatedGame = {
        ...baseActiveGame,
        player1Letters: "S",
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
      };

      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [[baseActiveGame]],
          updateResults: [[updatedGame]],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" } });
      const res = createRes();

      await callHandler("post", "/:id/setter-bail", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          gameOver: false,
          message: expect.stringContaining("Letter earned"),
        })
      );
    });

    it("returns game over when setter gets S.K.A.T.E.", async () => {
      const gameWithSKAT = {
        ...baseActiveGame,
        player1Letters: "SKAT",
      };
      const completedGame = {
        ...gameWithSKAT,
        status: "completed",
        winnerId: "user-2",
        player1Letters: "SKATE",
      };

      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [[gameWithSKAT]],
          updateResults: [[completedGame]],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" } });
      const res = createRes();

      await callHandler("post", "/:id/setter-bail", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          gameOver: true,
          winnerId: "user-2",
        })
      );
    });

    it("returns error when user is not the setter", async () => {
      const gameWhereUser2Sets = {
        ...baseActiveGame,
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
      };

      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createTx({
          selectResults: [[gameWhereUser2Sets]],
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" } });
      const res = createRes();

      await callHandler("post", "/:id/setter-bail", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Only the setter can declare a bail",
      });
    });

    it("returns 500 on unexpected error", async () => {
      mockTransaction.mockRejectedValue(new Error("DB connection lost"));

      const req = createReq({ params: { id: "game-1" } });
      const res = createRes();

      await callHandler("post", "/:id/setter-bail", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to process setter bail",
      });
    });
  });
});
