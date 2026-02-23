/**
 * @fileoverview Unit tests for remote S.K.A.T.E. routes
 *
 * Tests POST /:gameId/rounds/:roundId/resolve
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockVerifyIdToken = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();

const mockTransaction = vi.fn();

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
    firestore: Object.assign(
      () => ({
        collection: (name: string) => ({
          doc: (id: string) => ({
            collection: (subName: string) => ({
              doc: (subId?: string) => ({
                id: subId || "new-round-id",
              }),
            }),
          }),
        }),
        runTransaction: mockTransaction,
      }),
      {
        FieldValue: {
          serverTimestamp: () => "SERVER_TIMESTAMP",
        },
      }
    ),
  },
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

// Capture route handlers
const routeHandlers: Record<string, any[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    post: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    }),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../../routes/remoteSkate");

// ============================================================================
// Helpers
// ============================================================================

function createReq(overrides: any = {}) {
  return {
    headers: { authorization: "Bearer valid-token" },
    params: { gameId: "game-1", roundId: "round-1" },
    body: { result: "landed" },
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
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("Remote Skate Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
  });

  describe("POST /:gameId/rounds/:roundId/resolve", () => {
    it("should return 401 with no auth header", async () => {
      const req = createReq({ headers: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 401 with invalid auth format", async () => {
      const req = createReq({ headers: { authorization: "Basic token" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 401 with invalid token", async () => {
      mockVerifyIdToken.mockRejectedValue(new Error("invalid token"));
      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 with invalid body", async () => {
      const req = createReq({ body: { result: "invalid" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should transition round to awaiting_confirmation with landed claim", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply",
            setVideoId: "vid-1",
            replyVideoId: "vid-2",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        await fn(transaction);
        expect(transaction.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            status: "awaiting_confirmation",
            offenseClaim: "landed",
          })
        );
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        status: "awaiting_confirmation",
        offenseClaim: "landed",
      });
    });

    it("should transition round to awaiting_confirmation with missed claim", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: { "user-2": "SK" },
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply",
            setVideoId: "vid-1",
            replyVideoId: "vid-2",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        await fn(transaction);
        // No letters assigned yet — deferred to /confirm
        expect(transaction.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            status: "awaiting_confirmation",
            offenseClaim: "missed",
          })
        );
      });

      const req = createReq({ body: { result: "missed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        status: "awaiting_confirmation",
        offenseClaim: "missed",
      });
    });

    it("should not finalize round on resolve (deferred to confirm)", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: { "user-2": "SKAT" },
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply",
            setVideoId: "vid-1",
            replyVideoId: "vid-2",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        await fn(transaction);
        // No next round created and no game completion — that happens in /confirm
        expect(transaction.set).not.toHaveBeenCalled();
      });

      const req = createReq({ body: { result: "missed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        status: "awaiting_confirmation",
        offenseClaim: "missed",
      });
    });

    it("should return 404 when game not found", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = { exists: false };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "GAME_NOT_FOUND",
        message: "Game not found.",
      });
    });

    it("should return 403 when non-participant accesses game", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "other-1",
            playerBUid: "other-2",
            status: "active",
            letters: {},
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "ACCESS_DENIED",
        message: "You do not have access to this resource.",
      });
    });

    it("should return 400 when game is not active", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "complete",
            letters: {},
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "INVALID_STATE",
        message: "This action cannot be performed right now.",
      });
    });

    it("should return 403 when caller is not offense", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-2", // Not user-1
            defenseUid: "user-1",
            status: "awaiting_reply",
            setVideoId: "vid-1",
            replyVideoId: "vid-2",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "ACCESS_DENIED",
        message: "You do not have permission to perform this action.",
      });
    });

    it("should return 400 when videos not uploaded", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply",
            setVideoId: "vid-1",
            replyVideoId: null, // Missing
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "INVALID_STATE",
        message: "This action cannot be performed right now.",
      });
    });

    it("should return 404 when round not found", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = { exists: false };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "ROUND_NOT_FOUND",
        message: "Round not found.",
      });
    });

    it("should return 400 when round is not in a resolvable state", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_set", // Not awaiting_reply
            setVideoId: null,
            replyVideoId: null,
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "INVALID_STATE",
        message: "This action cannot be performed right now.",
      });
    });

    it("should return 500 on unexpected error", async () => {
      mockTransaction.mockRejectedValue(new Error("Unexpected"));
      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "INTERNAL_ERROR",
        message: "Failed to resolve round.",
      });
    });
  });

  describe("POST /:gameId/rounds/:roundId/confirm", () => {
    it("should return 401 with no auth header", async () => {
      const req = createReq({ headers: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should finalize round when defense agrees", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_confirmation",
            offenseClaim: "landed",
            setVideoId: "vid-1",
            replyVideoId: "vid-2",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        return await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, disputed: false, result: "landed" })
      );
    });

    it("should flag round as disputed when defense disagrees", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_confirmation",
            offenseClaim: "landed",
            setVideoId: "vid-1",
            replyVideoId: "vid-2",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        return await fn(transaction);
      });

      const req = createReq({ body: { result: "missed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, disputed: true })
      );
    });

    it("should complete game when defense agrees and reaches SKATE", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: { "user-2": "SKAT" },
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_confirmation",
            offenseClaim: "missed",
            setVideoId: "vid-1",
            replyVideoId: "vid-2",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        return await fn(transaction);
      });

      const req = createReq({ body: { result: "missed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, disputed: false, result: "missed" })
      );
    });

    it("should return 400 with invalid body", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      const req = createReq({ body: { result: "invalid" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when game not found", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = { exists: false };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "GAME_NOT_FOUND",
        message: "Game not found.",
      });
    });

    it("should return 403 when non-participant accesses game in confirm", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "outsider" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "ACCESS_DENIED",
        message: "You do not have access to this resource.",
      });
    });

    it("should return 400 when game is not active in confirm", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "complete",
            letters: {},
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "INVALID_STATE",
        message: "This action cannot be performed right now.",
      });
    });

    it("should return 404 when round not found in confirm", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = { exists: false };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "ROUND_NOT_FOUND",
        message: "Round not found.",
      });
    });

    it("should return 400 when round is not awaiting confirmation", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply", // Not awaiting_confirmation
            offenseClaim: null,
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "INVALID_STATE",
        message: "This action cannot be performed right now.",
      });
    });

    it("should return 403 when offense tries to confirm", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
            letters: {},
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_confirmation",
            offenseClaim: "landed",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 500 on unexpected error", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockRejectedValue(new Error("Unexpected"));
      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
