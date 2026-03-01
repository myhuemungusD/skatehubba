/**
 * @fileoverview Unit tests for server/routes/matchmaking.ts (matchmakingRouter)
 *
 * Tests POST /api/matchmaking/quick-match — find a random opponent
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../middleware/security", () => ({
  quickMatchLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../services/notificationService", () => ({
  sendQuickMatchNotification: vi.fn(),
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@shared/schema", () => ({
  customUsers: {
    id: "id",
    firstName: "firstName",
    pushToken: "pushToken",
    isActive: "isActive",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// Capture route handlers via mock Router
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

await import("../routes/matchmaking");

const { getDb } = await import("../db");
const { sendQuickMatchNotification } = await import("../services/notificationService");
const logger = (await import("../logger")).default;

// ============================================================================
// Helpers
// ============================================================================

function mockReq(overrides: Record<string, any> = {}) {
  return {
    body: {},
    headers: {},
    currentUser: { id: "user1", firstName: "Test" },
    ...overrides,
  };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function buildMatchmakingDb(users: any[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(users),
        }),
      }),
    }),
  };
}

async function callHandler(routeKey: string, req: any, res: any) {
  const handlers = routeHandlers[routeKey];
  if (!handlers) throw new Error(`Route ${routeKey} not registered`);
  const handler = handlers[handlers.length - 1];
  await handler(req, res);
}

// ============================================================================
// Tests
// ============================================================================

describe("POST /api/matchmaking/quick-match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should find a match and send notification", async () => {
    const opponents = [{ id: "opponent1", firstName: "Opponent", pushToken: "expo-token-1" }];
    vi.mocked(getDb).mockReturnValue(buildMatchmakingDb(opponents) as any);
    vi.mocked(sendQuickMatchNotification).mockResolvedValue(undefined);

    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(sendQuickMatchNotification).toHaveBeenCalledWith(
      "expo-token-1",
      "Test",
      expect.stringContaining("qm-")
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        match: expect.objectContaining({
          opponentId: "opponent1",
          opponentName: "Opponent",
        }),
      })
    );
  });

  it("should use gameId from request body as challengeId when provided", async () => {
    const opponents = [{ id: "opponent1", firstName: "Opponent", pushToken: "expo-token-1" }];
    vi.mocked(getDb).mockReturnValue(buildMatchmakingDb(opponents) as any);
    vi.mocked(sendQuickMatchNotification).mockResolvedValue(undefined);

    const req = mockReq({ body: { gameId: "game-abc-123" } });
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(sendQuickMatchNotification).toHaveBeenCalledWith("expo-token-1", "Test", "game-abc-123");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        match: expect.objectContaining({
          challengeId: "game-abc-123",
        }),
      })
    );
  });

  it("should return 404 when no eligible opponents (only current user)", async () => {
    const users = [{ id: "user1", firstName: "Test", pushToken: "tok" }];
    vi.mocked(getDb).mockReturnValue(buildMatchmakingDb(users) as any);

    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "No opponents available" })
    );
  });

  it("should return 404 when opponents have no push tokens", async () => {
    const users = [{ id: "other", firstName: "NoPush", pushToken: null }];
    vi.mocked(getDb).mockReturnValue(buildMatchmakingDb(users) as any);

    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("should return 401 when currentUser is missing", async () => {
    const req = mockReq({ currentUser: null });
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("should return 500 when db is unavailable", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("Database not configured");
    });

    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to find match" });
  });

  it("should return 500 on unexpected error", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("boom");
    });

    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to find match" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("should use 'Skater' when opponent has no firstName (line 81 fallback)", async () => {
    const opponents = [{ id: "opponent1", firstName: null, pushToken: "expo-token-1" }];
    vi.mocked(getDb).mockReturnValue(buildMatchmakingDb(opponents) as any);
    vi.mocked(sendQuickMatchNotification).mockResolvedValue(undefined);

    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        match: expect.objectContaining({
          opponentName: "Skater",
        }),
      })
    );
  });

  it("should return 500 when sendQuickMatchNotification throws", async () => {
    const opponents = [{ id: "opponent1", firstName: "Opponent", pushToken: "expo-token-1" }];
    vi.mocked(getDb).mockReturnValue(buildMatchmakingDb(opponents) as any);
    vi.mocked(sendQuickMatchNotification).mockRejectedValue(new Error("Push service down"));

    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to find match" });
    expect(logger.error).toHaveBeenCalled();
  });
});
