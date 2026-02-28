/**
 * @fileoverview Unit tests for remote S.K.A.T.E. routes
 *
 * Tests all remote skate endpoints:
 * - POST /find-or-create
 * - POST /:gameId/join
 * - POST /:gameId/cancel
 * - POST /:gameId/rounds/:roundId/set-complete
 * - POST /:gameId/rounds/:roundId/reply-complete
 * - POST /:gameId/rounds/:roundId/resolve
 * - POST /:gameId/rounds/:roundId/confirm
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockVerifyIdToken = vi.fn();
const mockTransaction = vi.fn();
const mockCollectionGet = vi.fn();
const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockDocGet = vi.fn().mockResolvedValue({
  exists: true,
  data: () => ({ playerAUid: "other-user", playerBUid: "user-1" }),
});

// Chainable query mock
const mockQueryChain = () => {
  const chain: any = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: mockCollectionGet,
  };
  return chain;
};

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
    firestore: Object.assign(
      () => ({
        collection: (name: string) => {
          const qChain = mockQueryChain();
          return {
            doc: (id?: string) => ({
              id: id || "new-game-id",
              collection: (subName: string) => ({
                doc: (subId?: string) => ({
                  id: subId || "new-round-id",
                }),
              }),
              get: mockDocGet,
              set: mockDocSet,
            }),
            where: qChain.where,
            limit: qChain.limit,
            get: qChain.get,
          };
        },
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

const mockSendNotification = vi.fn().mockResolvedValue(undefined);

vi.mock("../../services/gameNotificationService", () => ({
  sendGameNotificationToUser: (...args: any[]) => mockSendNotification(...args),
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

    it("should send notification after successful resolve", async () => {
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
        };
        await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, status: "awaiting_confirmation" })
      );
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("should still succeed even if notification fails on resolve", async () => {
      mockSendNotification.mockRejectedValueOnce(new Error("FCM down"));
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
        };
        await fn(transaction);
      });

      const req = createReq({ body: { result: "landed" } });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
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

    it("should return 500 with non-Error rejection", async () => {
      mockTransaction.mockRejectedValue("string error");
      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
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

    it("should return 500 with non-Error rejection", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockRejectedValue("string error");
      const req = createReq();
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/confirm", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ==========================================================================
  // NEW ENDPOINTS
  // ==========================================================================

  describe("POST /find-or-create", () => {
    it("should return 401 with no auth header", async () => {
      const req = createReq({ headers: {}, params: {}, body: {} });
      const res = createRes();
      await callHandler("POST /find-or-create", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should match with existing waiting game from another player", async () => {
      mockCollectionGet.mockResolvedValueOnce({
        docs: [
          {
            id: "existing-game-1",
            data: () => ({
              playerAUid: "other-user",
              playerBUid: null,
              status: "waiting",
            }),
          },
        ],
      });

      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "other-user",
            playerBUid: null,
            status: "waiting",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValue(gameSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        return await fn(transaction);
      });

      const req = createReq({ params: {}, body: {} });
      const res = createRes();
      await callHandler("POST /find-or-create", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, gameId: "existing-game-1", matched: true })
      );
      // Should notify game creator
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("should rejoin own waiting game when no others available", async () => {
      // No joinable games from others
      mockCollectionGet.mockResolvedValueOnce({ docs: [] });
      // Own waiting game exists
      mockCollectionGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: "my-game" }],
      });

      const req = createReq({ params: {}, body: {} });
      const res = createRes();
      await callHandler("POST /find-or-create", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, gameId: "my-game", matched: false })
      );
    });

    it("should create new game when no waiting games exist", async () => {
      // No waiting games
      mockCollectionGet.mockResolvedValueOnce({ docs: [] });
      // No own waiting game
      mockCollectionGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const req = createReq({ params: {}, body: {} });
      const res = createRes();
      await callHandler("POST /find-or-create", req, res);
      expect(mockDocSet).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, matched: false })
      );
    });

    it("should still succeed even if notification fails on find-or-create", async () => {
      mockSendNotification.mockRejectedValueOnce(new Error("FCM down"));
      mockCollectionGet.mockResolvedValueOnce({
        docs: [
          {
            id: "existing-game-1",
            data: () => ({
              playerAUid: "other-user",
              playerBUid: null,
              status: "waiting",
            }),
          },
        ],
      });

      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "other-user",
            playerBUid: null,
            status: "waiting",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValue(gameSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        return await fn(transaction);
      });

      const req = createReq({ params: {}, body: {} });
      const res = createRes();
      await callHandler("POST /find-or-create", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, matched: true })
      );
    });

    it("should skip games where current user is playerA", async () => {
      // First game is the user's own, should be skipped; no other games
      mockCollectionGet.mockResolvedValueOnce({
        docs: [
          {
            id: "my-game",
            data: () => ({
              playerAUid: "user-1", // Same as authenticated user
              playerBUid: null,
              status: "waiting",
            }),
          },
        ],
      });
      // Check own waiting games
      mockCollectionGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: "my-game" }],
      });

      const req = createReq({ params: {}, body: {} });
      const res = createRes();
      await callHandler("POST /find-or-create", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, gameId: "my-game", matched: false })
      );
    });

    it("should return 500 on unexpected error", async () => {
      mockCollectionGet.mockRejectedValueOnce(new Error("DB error"));

      const req = createReq({ params: {}, body: {} });
      const res = createRes();
      await callHandler("POST /find-or-create", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 500 with non-Error rejection in find-or-create", async () => {
      mockCollectionGet.mockRejectedValueOnce("string error");

      const req = createReq({ params: {}, body: {} });
      const res = createRes();
      await callHandler("POST /find-or-create", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("POST /:gameId/join", () => {
    it("should return 401 with no auth header", async () => {
      const req = createReq({ headers: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should join a waiting game successfully", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "other-user",
            playerBUid: null,
            status: "waiting",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValue(gameSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        return await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, gameId: "game-1" })
      );
    });

    it("should return 400 when trying to join own game", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1", // Same as authenticated user
            playerBUid: null,
            status: "waiting",
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when game is full", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "other-user",
            playerBUid: "another-user",
            status: "active",
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should send notification after successful join", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "other-user",
            playerBUid: null,
            status: "waiting",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValue(gameSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        return await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      // Notification should be attempted (best-effort)
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("should return 404 when game not found in join transaction", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = { exists: false };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 400 when game is not waiting", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "other-user",
            playerBUid: null,
            status: "active",
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should still succeed even if notification fails on join", async () => {
      mockSendNotification.mockRejectedValueOnce(new Error("FCM down"));
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "other-user",
            playerBUid: null,
            status: "waiting",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValue(gameSnap),
          update: vi.fn(),
          set: vi.fn(),
        };
        return await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("should return 500 on unexpected error", async () => {
      mockTransaction.mockRejectedValue(new Error("Unexpected DB error"));

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 500 with non-Error rejection", async () => {
      mockTransaction.mockRejectedValue("string error");

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/join", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("POST /:gameId/cancel", () => {
    it("should return 401 with no auth header", async () => {
      const req = createReq({ headers: {} });
      const res = createRes();
      await callHandler("POST /:gameId/cancel", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should cancel a waiting game", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: null,
            status: "waiting",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValue(gameSnap),
          update: vi.fn(),
        };
        await fn(transaction);
        expect(transaction.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ status: "cancelled" })
        );
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/cancel", req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("should return 403 when non-creator tries to cancel", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "other-user" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: null,
            status: "waiting",
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/cancel", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 when game not found in cancel", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = { exists: false };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/cancel", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "GAME_NOT_FOUND",
        message: "Game not found.",
      });
    });

    it("should no-op when game is already active", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValue(gameSnap),
          update: vi.fn(),
        };
        await fn(transaction);
        // update should NOT be called since status !== "waiting"
        expect(transaction.update).not.toHaveBeenCalled();
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/cancel", req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("should return 500 on unexpected error", async () => {
      mockTransaction.mockRejectedValue(new Error("Unexpected"));
      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/cancel", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 500 with non-Error rejection", async () => {
      mockTransaction.mockRejectedValue("string error");
      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/cancel", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("POST /:gameId/rounds/:roundId/set-complete", () => {
    it("should return 401 with no auth header", async () => {
      const req = createReq({ headers: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should mark set complete and update turn", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_set",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
        };
        await fn(transaction);
        expect(transaction.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ status: "awaiting_reply" })
        );
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("should return 400 when round is not in awaiting_set state", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply", // Not awaiting_set
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "INVALID_STATE",
        message: "This action cannot be performed right now.",
      });
    });

    it("should return 403 when non-offense player calls set-complete", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_set",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should send notification after successful set-complete", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_set",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("should return 404 when game not found in set-complete", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = { exists: false };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 403 when non-participant accesses set-complete", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "outsider" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 when game is not active in set-complete", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "complete",
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when round not found in set-complete", async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = { exists: false };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should still succeed even if notification fails", async () => {
      mockSendNotification.mockRejectedValueOnce(new Error("FCM down"));
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_set",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("should return 500 on unexpected error", async () => {
      mockTransaction.mockRejectedValue(new Error("Unexpected"));
      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 500 with non-Error rejection", async () => {
      mockTransaction.mockRejectedValue("string error");
      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/set-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("POST /:gameId/rounds/:roundId/reply-complete", () => {
    it("should return 401 with no auth header", async () => {
      const req = createReq({ headers: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should update turn back to offense", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
        };
        await fn(transaction);
        expect(transaction.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ currentTurnUid: "user-1" })
        );
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("should return 403 when offense player calls reply-complete", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-1" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 when round is not in awaiting_reply state", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_set", // Not awaiting_reply
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "INVALID_STATE",
        message: "This action cannot be performed right now.",
      });
    });

    it("should send notification after successful reply-complete", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(mockSendNotification).toHaveBeenCalled();
    });

    it("should still succeed even if notification fails on reply-complete", async () => {
      mockSendNotification.mockRejectedValueOnce(new Error("FCM down"));
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = {
          exists: true,
          data: () => ({
            offenseUid: "user-1",
            defenseUid: "user-2",
            status: "awaiting_reply",
          }),
        };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
          update: vi.fn(),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("should return 500 on unexpected error", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockRejectedValue(new Error("Unexpected"));
      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "INTERNAL_ERROR",
        message: "Failed to mark reply complete.",
      });
    });

    it("should return 404 when game not found in reply-complete", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = { exists: false };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "GAME_NOT_FOUND",
        message: "Game not found.",
      });
    });

    it("should return 403 when non-participant accesses reply-complete", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "outsider" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 when game is not active in reply-complete", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "complete",
          }),
        };
        const transaction = { get: vi.fn().mockResolvedValue(gameSnap) };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when round not found in reply-complete", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockImplementation(async (fn: any) => {
        const gameSnap = {
          exists: true,
          data: () => ({
            playerAUid: "user-1",
            playerBUid: "user-2",
            status: "active",
          }),
        };
        const roundSnap = { exists: false };
        const transaction = {
          get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
        };
        await fn(transaction);
      });

      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 500 with non-Error rejection", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "user-2" });
      mockTransaction.mockRejectedValue("string error");
      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /:gameId/rounds/:roundId/reply-complete", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
