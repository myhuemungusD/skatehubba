/**
 * @fileoverview Additional branch coverage for server/routes/matchmaking.ts
 *
 * Covers uncovered branches:
 * - Opponent with no firstName (line 79 fallback to "Skater")
 * - Current user with no firstName (line 16 fallback to "Skater")
 * - Quick match with opponent whose pushToken is falsy (already tested but edge case)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

function buildDb(users: any[]) {
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

describe("matchmaking branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses 'Skater' fallback for opponent with no firstName", async () => {
    const opponents = [{ id: "opp1", firstName: null, pushToken: "expo-tok" }];
    vi.mocked(getDb).mockReturnValue(buildDb(opponents) as any);
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

  it("uses 'Skater' fallback for current user with no firstName", async () => {
    const opponents = [{ id: "opp2", firstName: "Other", pushToken: "tok2" }];
    vi.mocked(getDb).mockReturnValue(buildDb(opponents) as any);
    vi.mocked(sendQuickMatchNotification).mockResolvedValue(undefined);

    const req = mockReq({ currentUser: { id: "user1", firstName: null } });
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    // Notification sent with "Skater" as the requester name
    expect(sendQuickMatchNotification).toHaveBeenCalledWith(
      "tok2",
      "Skater",
      expect.stringContaining("qm-")
    );
  });

  it("uses 'Skater' fallback for current user with undefined firstName", async () => {
    const opponents = [{ id: "opp3", firstName: "Rival", pushToken: "tok3" }];
    vi.mocked(getDb).mockReturnValue(buildDb(opponents) as any);
    vi.mocked(sendQuickMatchNotification).mockResolvedValue(undefined);

    const req = mockReq({ currentUser: { id: "user1" } });
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(sendQuickMatchNotification).toHaveBeenCalledWith(
      "tok3",
      "Skater",
      expect.stringContaining("qm-")
    );
  });

  it("returns 401 when currentUser has no id", async () => {
    const req = mockReq({ currentUser: { firstName: "NoId" } });
    const res = mockRes();
    await callHandler("POST /quick-match", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
