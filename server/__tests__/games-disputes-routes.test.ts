/**
 * @fileoverview Unit tests for S.K.A.T.E. Game Dispute Routes
 *
 * Tests route handlers directly by capturing Express router registrations.
 *
 * POST /:id/dispute — File a dispute
 * POST /disputes/:disputeId/resolve — Resolve a dispute
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

const mockIsDatabaseAvailable = vi.fn().mockReturnValue(true);
const mockTransaction = vi.fn();

function createDbChain() {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.execute = vi.fn().mockResolvedValue(undefined);
  chain.then = (resolve: any) => Promise.resolve([]).then(resolve);
  return chain;
}

vi.mock("../db", () => ({
  getDb: () => ({
    ...createDbChain(),
    transaction: mockTransaction,
  }),
  isDatabaseAvailable: () => mockIsDatabaseAvailable(),
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1" };
    next();
  },
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../logger", () => ({
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

const mockSendGameNotification = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/gameNotificationService", () => ({
  sendGameNotificationToUser: mockSendGameNotification,
}));

vi.mock("@shared/schema", () => ({
  games: { _table: "games", id: { name: "id" } },
  gameTurns: { _table: "gameTurns", id: { name: "id" } },
  gameDisputes: { _table: "gameDisputes", id: { name: "id" } },
  userProfiles: {
    _table: "userProfiles",
    id: { name: "id" },
    disputePenalties: { name: "disputePenalties" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true, strings }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

vi.mock("./games-shared", () => ({
  disputeSchema: {
    safeParse: (body: any) => {
      if (!body || !body.turnId || typeof body.turnId !== "number") {
        return { success: false, error: { flatten: () => ({ fieldErrors: {} }) } };
      }
      return { success: true, data: { turnId: body.turnId } };
    },
  },
  resolveDisputeSchema: {
    safeParse: (body: any) => {
      if (
        !body ||
        typeof body.disputeId !== "number" ||
        !["landed", "missed"].includes(body.finalResult)
      ) {
        return { success: false, error: { flatten: () => ({ fieldErrors: {} }) } };
      }
      return { success: true, data: { disputeId: body.disputeId, finalResult: body.finalResult } };
    },
  },
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
}));

// ============================================================================
// Capture route handlers from the Express Router
// ============================================================================

const routeHandlers: Record<string, any> = {};

vi.mock("express", () => {
  const mockRouter = {
    post: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    }),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  };
  return {
    Router: () => mockRouter,
  };
});

// ============================================================================
// Import the module (triggers route registration)
// ============================================================================

await import("../routes/games-disputes");

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

async function callHandler(routeKey: string, req: any, res: any) {
  const handlers = routeHandlers[routeKey];
  if (!handlers) throw new Error(`Route ${routeKey} not registered`);

  // Walk through middleware chain then handler
  for (const handler of handlers) {
    await handler(req, res, vi.fn());
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("Game Dispute Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDatabaseAvailable.mockReturnValue(true);
  });

  // ==========================================================================
  // POST /:id/dispute
  // ==========================================================================

  describe("POST /:id/dispute", () => {
    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: "Database unavailable" });
    });

    it("returns 400 for invalid body", async () => {
      const req = createReq({ params: { id: "game-1" }, body: {} });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request" }));
    });

    it("returns 403 when user is not a player", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        let callIdx = 0;
        tx.execute = vi.fn().mockResolvedValue(undefined);
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            // game query
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: "game-1",
                    player1Id: "other-1",
                    player2Id: "other-2",
                    status: "active",
                  },
                ]).then(r),
            };
          }
          return { then: (r: any) => Promise.resolve([]).then(r) };
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You are not a player in this game",
      });
    });

    it("returns 400 when game is not active", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        tx.limit = vi.fn().mockReturnValue({
          then: (r: any) =>
            Promise.resolve([
              {
                id: "game-1",
                player1Id: "user-1",
                player2Id: "user-2",
                status: "completed",
              },
            ]).then(r),
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Game is not active" });
    });

    it("returns 400 when dispute already used", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        tx.limit = vi.fn().mockReturnValue({
          then: (r: any) =>
            Promise.resolve([
              {
                id: "game-1",
                player1Id: "user-1",
                player2Id: "user-2",
                status: "active",
                player1DisputeUsed: true,
              },
            ]).then(r),
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "You have already used your dispute for this game",
      });
    });

    it("returns 404 when turn not found", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let callIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: "game-1",
                    player1Id: "user-1",
                    player2Id: "user-2",
                    status: "active",
                    player1DisputeUsed: false,
                  },
                ]).then(r),
            };
          }
          // turn query — not found
          return { then: (r: any) => Promise.resolve([]).then(r) };
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 999 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Turn not found" });
    });

    it("returns 400 when turn belongs to different game", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let callIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: "game-1",
                    player1Id: "user-1",
                    player2Id: "user-2",
                    status: "active",
                    player1DisputeUsed: false,
                  },
                ]).then(r),
            };
          }
          return {
            then: (r: any) =>
              Promise.resolve([
                {
                  id: 1,
                  gameId: "game-other",
                  result: "missed",
                  playerId: "user-1",
                  judgedBy: "user-2",
                },
              ]).then(r),
          };
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Turn does not belong to this game",
      });
    });

    it("returns 400 when turn result is not 'missed'", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let callIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: "game-1",
                    player1Id: "user-1",
                    player2Id: "user-2",
                    status: "active",
                    player1DisputeUsed: false,
                  },
                ]).then(r),
            };
          }
          return {
            then: (r: any) =>
              Promise.resolve([
                {
                  id: 1,
                  gameId: "game-1",
                  result: "landed",
                  playerId: "user-1",
                  judgedBy: "user-2",
                },
              ]).then(r),
          };
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Can only dispute a BAIL judgment",
      });
    });

    it("returns 400 when turn is not yours", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let callIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: "game-1",
                    player1Id: "user-1",
                    player2Id: "user-2",
                    status: "active",
                    player1DisputeUsed: false,
                  },
                ]).then(r),
            };
          }
          return {
            then: (r: any) =>
              Promise.resolve([
                {
                  id: 1,
                  gameId: "game-1",
                  result: "missed",
                  playerId: "user-2", // not the current user
                  judgedBy: "user-1",
                },
              ]).then(r),
          };
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "You can only dispute judgments on your own tricks",
      });
    });

    it("returns 400 when turn has not been judged", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let callIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: "game-1",
                    player1Id: "user-1",
                    player2Id: "user-2",
                    status: "active",
                    player1DisputeUsed: false,
                  },
                ]).then(r),
            };
          }
          return {
            then: (r: any) =>
              Promise.resolve([
                {
                  id: 1,
                  gameId: "game-1",
                  result: "missed",
                  playerId: "user-1",
                  judgedBy: null, // not judged yet
                },
              ]).then(r),
          };
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Turn has not been judged yet",
      });
    });

    it("succeeds and creates dispute (201)", async () => {
      const disputeRecord = {
        id: "dispute-1",
        gameId: "game-1",
        turnId: 1,
        disputedBy: "user-1",
        againstPlayerId: "user-2",
        originalResult: "missed",
      };

      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let selectCallIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          selectCallIdx++;
          if (selectCallIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: "game-1",
                    player1Id: "user-1",
                    player2Id: "user-2",
                    status: "active",
                    player1DisputeUsed: false,
                  },
                ]).then(r),
            };
          }
          return {
            then: (r: any) =>
              Promise.resolve([
                {
                  id: 1,
                  gameId: "game-1",
                  result: "missed",
                  playerId: "user-1",
                  judgedBy: "user-2",
                },
              ]).then(r),
          };
        });
        tx.returning = vi.fn().mockReturnValue({
          then: (r: any) => Promise.resolve([disputeRecord]).then(r),
        });
        return callback(tx);
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          dispute: disputeRecord,
          message: "Dispute filed. Awaiting resolution.",
        })
      );
      expect(mockSendGameNotification).toHaveBeenCalledWith("user-2", "dispute_filed", {
        gameId: "game-1",
        disputeId: "dispute-1",
      });
    });

    it("returns 500 on unexpected transaction error", async () => {
      mockTransaction.mockRejectedValue(new Error("DB crash"));

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to file dispute" });
    });
  });

  // ==========================================================================
  // POST /disputes/:disputeId/resolve
  // ==========================================================================

  describe("POST /disputes/:disputeId/resolve", () => {
    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);

      const req = createReq({
        params: { disputeId: "1" },
        body: { finalResult: "landed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: "Database unavailable" });
    });

    it("returns 400 for invalid body", async () => {
      const req = createReq({
        params: { disputeId: "abc" }, // NaN
        body: { finalResult: "invalid" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request" }));
    });

    it("returns 404 when dispute is not found", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        tx.limit = vi.fn().mockReturnValue({
          then: (r: any) => Promise.resolve([]).then(r),
        });
        return callback(tx);
      });

      const req = createReq({
        params: { disputeId: "999" },
        body: { finalResult: "landed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Dispute not found" });
    });

    it("returns 400 when dispute is already resolved", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        tx.limit = vi.fn().mockReturnValue({
          then: (r: any) =>
            Promise.resolve([
              {
                id: 1,
                gameId: "game-1",
                disputedBy: "user-2",
                againstPlayerId: "user-1",
                finalResult: "landed", // already resolved
              },
            ]).then(r),
        });
        return callback(tx);
      });

      const req = createReq({
        params: { disputeId: "1" },
        body: { finalResult: "landed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Dispute already resolved" });
    });

    it("returns 403 when current user is not the judging player", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        tx.limit = vi.fn().mockReturnValue({
          then: (r: any) =>
            Promise.resolve([
              {
                id: 1,
                gameId: "game-1",
                disputedBy: "user-2",
                againstPlayerId: "user-other", // not user-1
                finalResult: null,
              },
            ]).then(r),
        });
        return callback(tx);
      });

      const req = createReq({
        params: { disputeId: "1" },
        body: { finalResult: "landed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Only the judging player can resolve the dispute",
      });
    });

    it("returns 404 when game is not found", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let callIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: 1,
                    gameId: "game-1",
                    turnId: 1,
                    disputedBy: "user-2",
                    againstPlayerId: "user-1",
                    finalResult: null,
                  },
                ]).then(r),
            };
          }
          // game not found
          return { then: (r: any) => Promise.resolve([]).then(r) };
        });
        return callback(tx);
      });

      const req = createReq({
        params: { disputeId: "1" },
        body: { finalResult: "landed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Game not found" });
    });

    it("returns 400 when game is not active", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let callIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: 1,
                    gameId: "game-1",
                    turnId: 1,
                    disputedBy: "user-2",
                    againstPlayerId: "user-1",
                    finalResult: null,
                  },
                ]).then(r),
            };
          }
          return {
            then: (r: any) =>
              Promise.resolve([
                {
                  id: "game-1",
                  player1Id: "user-1",
                  player2Id: "user-2",
                  status: "completed",
                },
              ]).then(r),
          };
        });
        return callback(tx);
      });

      const req = createReq({
        params: { disputeId: "1" },
        body: { finalResult: "landed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Game is no longer active" });
    });

    it("resolves dispute with 'landed' — overturns BAIL", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let callIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: 1,
                    gameId: "game-1",
                    turnId: 1,
                    disputedBy: "user-2",
                    againstPlayerId: "user-1",
                    finalResult: null,
                  },
                ]).then(r),
            };
          }
          return {
            then: (r: any) =>
              Promise.resolve([
                {
                  id: "game-1",
                  player1Id: "user-1",
                  player2Id: "user-2",
                  status: "active",
                  player1Letters: "S",
                  player2Letters: "",
                  offensivePlayerId: "user-1",
                  defensivePlayerId: "user-2",
                },
              ]).then(r),
          };
        });
        return callback(tx);
      });

      const req = createReq({
        params: { disputeId: "1" },
        body: { finalResult: "landed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Dispute upheld. BAIL overturned to LAND. Letter removed.",
        })
      );
    });

    it("resolves dispute with 'missed' — BAIL stands", async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = createDbChain();
        tx.execute = vi.fn().mockResolvedValue(undefined);
        let callIdx = 0;
        tx.limit = vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) {
            return {
              then: (r: any) =>
                Promise.resolve([
                  {
                    id: 1,
                    gameId: "game-1",
                    turnId: 1,
                    disputedBy: "user-2",
                    againstPlayerId: "user-1",
                    finalResult: null,
                  },
                ]).then(r),
            };
          }
          return {
            then: (r: any) =>
              Promise.resolve([
                {
                  id: "game-1",
                  player1Id: "user-1",
                  player2Id: "user-2",
                  status: "active",
                  player1Letters: "S",
                  player2Letters: "",
                },
              ]).then(r),
          };
        });
        return callback(tx);
      });

      const req = createReq({
        params: { disputeId: "1" },
        body: { finalResult: "missed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Dispute denied. BAIL stands.",
        })
      );
    });

    it("returns 500 on unexpected error", async () => {
      mockTransaction.mockRejectedValue(new Error("DB crash"));

      const req = createReq({
        params: { disputeId: "1" },
        body: { finalResult: "landed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to resolve dispute" });
    });
  });
});
