/**
 * @fileoverview Integration tests for game challenge routes
 *
 * Tests:
 * - POST /create: challenge creation, self-challenge guard, opponent lookup, errors
 * - POST /:id/respond: accept, decline, wrong player, not pending, not found, errors
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks — must be declared before imports
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
}));

vi.mock("@shared/schema", () => ({
  games: { id: "id", player1Id: "player1Id", player2Id: "player2Id", status: "status" },
  customUsers: { id: "id" },
  usernames: { uid: "uid", username: "username" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("../../routes/games-shared", () => ({
  createGameSchema: {
    safeParse: (data: any) => {
      if (
        !data?.opponentId ||
        typeof data.opponentId !== "string" ||
        data.opponentId.length === 0
      ) {
        return {
          success: false,
          error: { flatten: () => ({ fieldErrors: { opponentId: ["required"] } }) },
        };
      }
      return { success: true, data: { opponentId: data.opponentId } };
    },
  },
  respondGameSchema: {
    safeParse: (data: any) => {
      if (typeof data?.accept !== "boolean") {
        return {
          success: false,
          error: { flatten: () => ({ fieldErrors: { accept: ["required"] } }) },
        };
      }
      return { success: true, data: { accept: data.accept } };
    },
  },
  getUserNameInfo: vi.fn().mockResolvedValue({ displayName: "TestPlayer", handle: "testplayer" }),
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
}));

// Controllable mock db returns — queue-based so each select() gets its own result
let selectQueue: any[][] = [];
let insertResult: any[] = [];
let updateResult: any[] = [];
let shouldGetDbThrow = false;

function nextSelectResult() {
  return selectQueue.length > 0 ? selectQueue.shift()! : [];
}

vi.mock("../../db", () => ({
  getDb: () => {
    if (shouldGetDbThrow) throw new Error("Database not configured");
    const makeSelectChain = () => {
      let _resolved = false;
      let _result: any;
      const resolve = () => {
        if (!_resolved) {
          _resolved = true;
          _result = Promise.resolve(nextSelectResult());
        }
        return _result;
      };
      const chain: any = {
        from: vi.fn().mockReturnValue(null as any),
      };
      const whereObj: any = {
        limit: vi.fn().mockImplementation(() => resolve()),
        then: (r: any, j?: any) => resolve().then(r, j),
      };
      const fromObj: any = {
        where: vi.fn().mockReturnValue(whereObj),
        limit: vi.fn().mockImplementation(() => resolve()),
        then: (r: any, j?: any) => resolve().then(r, j),
      };
      chain.from.mockReturnValue(fromObj);
      return chain;
    };
    return {
      select: vi.fn().mockImplementation(makeSelectChain),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => Promise.resolve(insertResult)),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => Promise.resolve(updateResult)),
          }),
        }),
      }),
    };
  },
  getUserDisplayName: vi.fn().mockResolvedValue("TestPlayer"),
}));

// =============================================================================
// Imports after mocks
// =============================================================================

await import("../../routes/games-challenges");
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

describe("Game Challenge Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue = [];
    insertResult = [];
    updateResult = [];
    shouldGetDbThrow = false;
  });

  // ===========================================================================
  // POST /create
  // ===========================================================================

  describe("POST /create", () => {
    it("creates a game challenge successfully", async () => {
      // [0] Opponent exists
      selectQueue.push([{ id: "opponent-1" }]);
      // Game created
      insertResult = [
        {
          id: "game-1",
          player1Id: "user-1",
          player2Id: "opponent-1",
          status: "pending",
        },
      ];

      const req = mockRequest({ body: { opponentId: "opponent-1" } });
      const res = mockResponse();

      await callRoute("POST", "/create", req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({ id: "game-1", status: "pending" }),
          message: "Challenge sent.",
        })
      );
      expect(sendGameNotificationToUser).toHaveBeenCalledWith(
        "opponent-1",
        "challenge_received",
        expect.any(Object)
      );
    });

    it("prevents challenging yourself", async () => {
      const req = mockRequest({
        body: { opponentId: "user-1" },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/create", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "SELF_CHALLENGE", message: "Cannot challenge yourself." })
      );
    });

    it("returns 404 when opponent not found", async () => {
      selectQueue.push([]); // No opponent

      const req = mockRequest({ body: { opponentId: "nonexistent" } });
      const res = mockResponse();

      await callRoute("POST", "/create", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "OPPONENT_NOT_FOUND", message: "Opponent not found." })
      );
    });

    it("returns 400 for invalid request body", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/create", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("returns 500 when database is unavailable", async () => {
      shouldGetDbThrow = true;
      const req = mockRequest({ body: { opponentId: "opponent-1" } });
      const res = mockResponse();

      await callRoute("POST", "/create", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "GAME_CREATE_FAILED",
          message: "Failed to create game.",
        })
      );
    });
  });

  // ===========================================================================
  // POST /:id/respond
  // ===========================================================================

  describe("POST /:id/respond", () => {
    it("accepts a challenge", async () => {
      // [0] game lookup
      selectQueue.push([
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          player2Name: "TestPlayer2",
          status: "pending",
        },
      ]);
      // [1] enrichGameWithHandles → handle lookup
      selectQueue.push([
        { uid: "challenger-1", username: "sk8r1" },
        { uid: "user-1", username: "sk8r2" },
      ]);
      updateResult = [
        {
          id: "game-1",
          status: "active",
          player1Id: "challenger-1",
          player2Id: "user-1",
        },
      ];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({
            status: "active",
            player1Handle: "sk8r1",
            player2Handle: "sk8r2",
          }),
          message: "Game on.",
        })
      );
      expect(sendGameNotificationToUser).toHaveBeenCalledWith(
        "challenger-1",
        "your_turn",
        expect.any(Object)
      );
    });

    it("declines a challenge", async () => {
      // [0] game lookup
      selectQueue.push([
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          status: "pending",
        },
      ]);
      // [1] enrichGameWithHandles → handle lookup
      selectQueue.push([{ uid: "challenger-1", username: "sk8r1" }]);
      updateResult = [
        { id: "game-1", status: "declined", player1Id: "challenger-1", player2Id: "user-1" },
      ];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: false },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({
            status: "declined",
            player1Handle: "sk8r1",
            player2Handle: null,
          }),
          message: "Challenge declined.",
        })
      );
    });

    it("rejects response from wrong player", async () => {
      selectQueue.push([
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "someone-else",
          status: "pending",
        },
      ]);

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "NOT_CHALLENGED_PLAYER",
          message: "Only the challenged player can respond.",
        })
      );
    });

    it("rejects response when game is not pending", async () => {
      selectQueue.push([
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          status: "active",
        },
      ]);

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "GAME_NOT_PENDING", message: "Game is not pending." })
      );
    });

    it("returns 404 when game not found", async () => {
      selectQueue.push([]);

      const req = mockRequest({
        params: { id: "nonexistent" },
        body: { accept: true },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "GAME_NOT_FOUND", message: "Game not found." })
      );
    });

    it("returns 500 when database is unavailable", async () => {
      shouldGetDbThrow = true;
      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "GAME_RESPOND_FAILED",
          message: "Failed to respond to game.",
        })
      );
    });

    it("returns 400 for invalid request body", async () => {
      const req = mockRequest({
        params: { id: "game-1" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("uses fallback opponent name when player2Name is null", async () => {
      selectQueue.push([
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          player2Name: null,
          status: "pending",
        },
      ]);
      selectQueue.push([{ uid: "challenger-1", username: "sk8r1" }]);
      updateResult = [
        { id: "game-1", status: "active", player1Id: "challenger-1", player2Id: "user-1" },
      ];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(sendGameNotificationToUser).toHaveBeenCalledWith(
        "challenger-1",
        "your_turn",
        expect.objectContaining({ opponentName: "Opponent" })
      );
    });

    it("skips handle enrichment when player IDs are null", async () => {
      selectQueue.push([
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          status: "pending",
        },
      ]);
      // enrichment should early-return (no handle query needed)
      updateResult = [{ id: "game-1", status: "declined", player1Id: null, player2Id: null }];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: false },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({ id: "game-1", status: "declined" }),
          message: "Challenge declined.",
        })
      );
      // No player1Handle/player2Handle added because playerIds was empty
      const gameResult = vi.mocked(res.json).mock.calls[0][0].game;
      expect(gameResult.player1Handle).toBeUndefined();
      expect(gameResult.player2Handle).toBeUndefined();
    });

    it("returns null player1Handle when player1Id is missing", async () => {
      selectQueue.push([
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          status: "pending",
        },
      ]);
      selectQueue.push([{ uid: "user-1", username: "sk8r2" }]);
      updateResult = [{ id: "game-1", status: "active", player1Id: null, player2Id: "user-1" }];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({
            player1Handle: null,
            player2Handle: "sk8r2",
          }),
        })
      );
    });

    it("returns null handles when no usernames found for player IDs", async () => {
      selectQueue.push([
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          status: "pending",
        },
      ]);
      // enrichment returns empty — no handles found
      selectQueue.push([]);
      updateResult = [
        { id: "game-1", status: "active", player1Id: "challenger-1", player2Id: "user-1" },
      ];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({
            player1Handle: null,
            player2Handle: null,
          }),
        })
      );
    });

    it("returns null player2Handle when player2Id is missing", async () => {
      selectQueue.push([
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          status: "pending",
        },
      ]);
      selectQueue.push([{ uid: "challenger-1", username: "sk8r1" }]);
      updateResult = [
        { id: "game-1", status: "active", player1Id: "challenger-1", player2Id: null },
      ];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({
            player1Handle: "sk8r1",
            player2Handle: null,
          }),
        })
      );
    });
  });
});
