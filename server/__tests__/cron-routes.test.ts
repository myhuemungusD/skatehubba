/**
 * @fileoverview Unit tests for server/routes/cron.ts (cronRouter)
 *
 * Tests:
 * - POST /api/cron/forfeit-expired-games
 * - POST /api/cron/deadline-warnings
 * - POST /api/cron/forfeit-stalled-games
 * - POST /api/cron/cleanup-sessions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../middleware/cronAuth", () => ({
  verifyCronSecret: vi.fn(),
}));

vi.mock("../routes/games", () => ({
  forfeitExpiredGames: vi.fn(),
  notifyDeadlineWarnings: vi.fn(),
  forfeitStalledGames: vi.fn(),
}));

vi.mock("../middleware/security", () => ({
  apiLimiter: (_req: any, _res: any, next: any) => next(),
  gameWriteLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
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
  authSessions: { expiresAt: "expiresAt" },
}));

vi.mock("drizzle-orm", () => ({
  lt: vi.fn(),
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

await import("../routes/cron");

const { getDb } = await import("../db");
const { verifyCronSecret } = await import("../middleware/cronAuth");
const { forfeitExpiredGames, notifyDeadlineWarnings, forfeitStalledGames } =
  await import("../routes/games");
const logger = (await import("../logger")).default;

// ============================================================================
// Helpers
// ============================================================================

function mockReq(overrides: Record<string, any> = {}) {
  return {
    headers: {},
    ...overrides,
  };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
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

describe("POST /api/cron/forfeit-expired-games", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should forfeit expired games with valid cron secret", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(forfeitExpiredGames).mockResolvedValue({ forfeited: 3 } as any);

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /forfeit-expired-games", req, res);

    expect(forfeitExpiredGames).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, forfeited: 3 }));
    expect(logger.info).toHaveBeenCalled();
  });

  it("should return 401 with invalid authorization", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(false);

    const req = mockReq({ headers: { authorization: "Bearer wrong" } });
    const res = mockRes();
    await callHandler("POST /forfeit-expired-games", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(forfeitExpiredGames).not.toHaveBeenCalled();
  });

  it("should return 500 when forfeitExpiredGames throws", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(forfeitExpiredGames).mockRejectedValue(new Error("DB timeout"));

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /forfeit-expired-games", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to process forfeit" });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("POST /api/cron/deadline-warnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send deadline warnings with valid cron secret", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(notifyDeadlineWarnings).mockResolvedValue({ notified: 5 } as any);

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /deadline-warnings", req, res);

    expect(notifyDeadlineWarnings).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, notified: 5 }));
  });

  it("should return 401 with invalid secret", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(false);

    const req = mockReq({ headers: { authorization: "Bearer nope" } });
    const res = mockRes();
    await callHandler("POST /deadline-warnings", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(notifyDeadlineWarnings).not.toHaveBeenCalled();
  });

  it("should return 500 when notifyDeadlineWarnings throws", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(notifyDeadlineWarnings).mockRejectedValue(new Error("fail"));

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /deadline-warnings", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to send deadline warnings" });
  });
});

describe("POST /api/cron/cleanup-sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should cleanup expired sessions and return deleted count", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);

    const mockDb = {
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 7 }),
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /cleanup-sessions", req, res);

    expect(mockDb.delete).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, deleted: 7 });
  });

  it("should return 401 with invalid cron secret", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(false);

    const req = mockReq({ headers: { authorization: "Bearer wrong" } });
    const res = mockRes();
    await callHandler("POST /cleanup-sessions", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("should return 500 when db is unavailable", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("Database not configured");
    });

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /cleanup-sessions", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to cleanup sessions" });
  });

  it("should return 500 when db.delete throws", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(getDb).mockReturnValue({
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("DB fail")),
      }),
    } as any);

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /cleanup-sessions", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to cleanup sessions" });
  });

  it("should default deleted count to 0 when rowCount is undefined", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(getDb).mockReturnValue({
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    } as any);

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /cleanup-sessions", req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, deleted: 0 });
  });
});

describe("POST /api/cron/forfeit-stalled-games", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should forfeit stalled games with valid cron secret", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(forfeitStalledGames).mockResolvedValue({ forfeited: 2 } as any);

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /forfeit-stalled-games", req, res);

    expect(forfeitStalledGames).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, forfeited: 2 }));
    expect(logger.info).toHaveBeenCalled();
  });

  it("should return 401 with invalid authorization", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(false);

    const req = mockReq({ headers: { authorization: "Bearer wrong" } });
    const res = mockRes();
    await callHandler("POST /forfeit-stalled-games", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(forfeitStalledGames).not.toHaveBeenCalled();
  });

  it("should return 500 when forfeitStalledGames throws", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(forfeitStalledGames).mockRejectedValue(new Error("DB timeout"));

    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    const res = mockRes();
    await callHandler("POST /forfeit-stalled-games", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to process stalled game forfeit" });
    expect(logger.error).toHaveBeenCalled();
  });
});
