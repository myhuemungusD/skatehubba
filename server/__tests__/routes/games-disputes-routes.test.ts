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

const mockTransaction = vi.fn();
let shouldGetDbThrow = false;

/** A mock result for the pre-transaction game lookup select chain */
let gameSelectResult: any[] = [];

function createDbChain() {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockImplementation(() => Promise.resolve(gameSelectResult));
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.execute = vi.fn().mockResolvedValue(undefined);
  chain.then = (resolve: any) => Promise.resolve([]).then(resolve);
  return chain;
}

vi.mock("../../db", () => ({
  getDb: () => {
    if (shouldGetDbThrow) throw new Error("Database not configured");
    return {
      ...createDbChain(),
      transaction: mockTransaction,
    };
  },
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1" };
    next();
  },
  requireAdmin: vi.fn((_req: any, _res: any, next: any) => next()),
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

const mockSendGameNotification = vi.fn().mockResolvedValue(undefined);

vi.mock("../../services/gameNotificationService", () => ({
  sendGameNotificationToUser: mockSendGameNotification,
}));

vi.mock("@shared/schema", () => ({
  games: {
    _table: "games",
    id: { name: "id" },
    player1Id: { name: "player1Id" },
    player2Id: { name: "player2Id" },
  },
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

const mockFileDispute = vi.fn();
const mockResolveDispute = vi.fn();

vi.mock("../../services/gameDisputeService", () => ({
  fileDispute: (...args: any[]) => mockFileDispute(...args),
  resolveDispute: (...args: any[]) => mockResolveDispute(...args),
}));

vi.mock("../../routes/games-shared", () => ({
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

await import("../../routes/games-disputes");

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
    shouldGetDbThrow = false;
    gameSelectResult = [];
  });

  // ==========================================================================
  // POST /:id/dispute
  // ==========================================================================

  describe("POST /:id/dispute", () => {
    it("returns 500 when database is unavailable", async () => {
      shouldGetDbThrow = true;

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to file dispute" });
    });

    it("returns 400 for invalid body", async () => {
      const req = createReq({ params: { id: "game-1" }, body: {} });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request" }));
    });

    it("returns 404 when game is not found", async () => {
      gameSelectResult = []; // No game found

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Game not found" });
    });

    it("returns 403 when user is not a player", async () => {
      gameSelectResult = [{ player1Id: "other-1", player2Id: "other-2" }];

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Only game participants can file disputes",
      });
    });

    it("returns error status when fileDispute returns not ok", async () => {
      gameSelectResult = [{ player1Id: "user-1", player2Id: "user-2" }];
      mockTransaction.mockImplementation(async (callback: any) => callback({}));
      mockFileDispute.mockResolvedValue({
        ok: false,
        status: 400,
        error: "You have already used your dispute for this game",
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "You have already used your dispute for this game",
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

      gameSelectResult = [{ player1Id: "user-1", player2Id: "user-2" }];
      mockTransaction.mockImplementation(async (callback: any) => callback({}));
      mockFileDispute.mockResolvedValue({
        ok: true,
        dispute: disputeRecord,
        opponentId: "user-2",
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

    it("skips notification when opponentId is null", async () => {
      gameSelectResult = [{ player1Id: "user-1", player2Id: "user-2" }];
      mockTransaction.mockImplementation(async (callback: any) => callback({}));
      mockFileDispute.mockResolvedValue({
        ok: true,
        dispute: { id: "dispute-1" },
        opponentId: null,
      });

      const req = createReq({ params: { id: "game-1" }, body: { turnId: 1 } });
      const res = createRes();

      await callHandler("POST /:id/dispute", req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockSendGameNotification).not.toHaveBeenCalled();
    });

    it("returns 500 on unexpected transaction error", async () => {
      gameSelectResult = [{ player1Id: "user-1", player2Id: "user-2" }];
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
    it("returns 500 when database is unavailable", async () => {
      shouldGetDbThrow = true;

      const req = createReq({
        params: { disputeId: "1" },
        body: { finalResult: "landed" },
      });
      const res = createRes();

      await callHandler("POST /disputes/:disputeId/resolve", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to resolve dispute" });
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

    it("returns error status when resolveDispute returns not ok", async () => {
      mockTransaction.mockImplementation(async (callback: any) => callback({}));
      mockResolveDispute.mockResolvedValue({
        ok: false,
        status: 404,
        error: "Dispute not found",
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
      mockTransaction.mockImplementation(async (callback: any) => callback({}));
      mockResolveDispute.mockResolvedValue({
        ok: false,
        status: 400,
        error: "Dispute already resolved",
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

    it("returns 403 when resolveDispute denies access", async () => {
      mockTransaction.mockImplementation(async (callback: any) => callback({}));
      mockResolveDispute.mockResolvedValue({
        ok: false,
        status: 403,
        error: "Only the judging player can resolve the dispute",
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

    it("resolves dispute with 'landed' — overturns BAIL", async () => {
      mockTransaction.mockImplementation(async (callback: any) => callback({}));
      mockResolveDispute.mockResolvedValue({
        ok: true,
        dispute: { id: 1, finalResult: "landed" },
        penaltyTarget: "user-2",
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
      mockTransaction.mockImplementation(async (callback: any) => callback({}));
      mockResolveDispute.mockResolvedValue({
        ok: true,
        dispute: { id: 1, finalResult: "missed" },
        penaltyTarget: "user-1",
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
