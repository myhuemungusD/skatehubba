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
}));

vi.mock("@shared/schema", () => ({
  games: { id: "id", player1Id: "player1Id", player2Id: "player2Id", status: "status" },
  customUsers: { id: "id" },
}));

vi.mock("../routes/games-shared", () => ({
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
  getUserDisplayName: vi.fn().mockResolvedValue("TestPlayer"),
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
}));

// Controllable mock db returns
const mockDbReturns = {
  selectResult: [] as any[],
  insertResult: [] as any[],
  updateResult: [] as any[],
};

let mockIsDatabaseAvailable = true;

vi.mock("../db", () => ({
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.insertResult)),
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
  getUserDisplayName: vi.fn().mockResolvedValue("TestPlayer"),
}));

// =============================================================================
// Imports after mocks
// =============================================================================

await import("../routes/games-challenges");
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

describe("Game Challenge Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.insertResult = [];
    mockDbReturns.updateResult = [];
    mockIsDatabaseAvailable = true;
  });

  // ===========================================================================
  // POST /create
  // ===========================================================================

  describe("POST /create", () => {
    it("creates a game challenge successfully", async () => {
      // Opponent exists
      mockDbReturns.selectResult = [{ id: "opponent-1" }];
      // Game created
      mockDbReturns.insertResult = [
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
        expect.objectContaining({ error: "Cannot challenge yourself" })
      );
    });

    it("returns 404 when opponent not found", async () => {
      mockDbReturns.selectResult = []; // No opponent

      const req = mockRequest({ body: { opponentId: "nonexistent" } });
      const res = mockResponse();

      await callRoute("POST", "/create", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Opponent not found" })
      );
    });

    it("returns 400 for invalid request body", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/create", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request" }));
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({ body: { opponentId: "opponent-1" } });
      const res = mockResponse();

      await callRoute("POST", "/create", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Database unavailable" })
      );
    });
  });

  // ===========================================================================
  // POST /:id/respond
  // ===========================================================================

  describe("POST /:id/respond", () => {
    it("accepts a challenge", async () => {
      mockDbReturns.selectResult = [
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          player2Name: "TestPlayer2",
          status: "pending",
        },
      ];
      mockDbReturns.updateResult = [
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
          game: expect.objectContaining({ status: "active" }),
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
      mockDbReturns.selectResult = [
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          status: "pending",
        },
      ];
      mockDbReturns.updateResult = [{ id: "game-1", status: "declined" }];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: false },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          game: expect.objectContaining({ status: "declined" }),
          message: "Challenge declined.",
        })
      );
    });

    it("rejects response from wrong player", async () => {
      mockDbReturns.selectResult = [
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "someone-else",
          status: "pending",
        },
      ];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Only the challenged player can respond" })
      );
    });

    it("rejects response when game is not pending", async () => {
      mockDbReturns.selectResult = [
        {
          id: "game-1",
          player1Id: "challenger-1",
          player2Id: "user-1",
          status: "active",
        },
      ];

      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
        currentUser: { id: "user-1" },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Game is not pending" })
      );
    });

    it("returns 404 when game not found", async () => {
      mockDbReturns.selectResult = [];

      const req = mockRequest({
        params: { id: "nonexistent" },
        body: { accept: true },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Game not found" }));
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;
      const req = mockRequest({
        params: { id: "game-1" },
        body: { accept: true },
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("returns 400 for invalid request body", async () => {
      const req = mockRequest({
        params: { id: "game-1" },
        body: {},
      });
      const res = mockResponse();

      await callRoute("POST", "/:id/respond", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request" }));
    });
  });
});
