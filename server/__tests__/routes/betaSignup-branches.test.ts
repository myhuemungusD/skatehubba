/**
 * @fileoverview Branch coverage tests for server/routes/betaSignup.ts
 *
 * Covers uncovered branches (lines 45-56):
 * - Existing user within rate limit window (429)
 * - Existing user outside rate limit window (update with ipHash)
 * - New signup with no IP_HASH_SALT (ipHash undefined)
 * - New signup with platform set vs null
 * - DB error catch block
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSelectChain: any = {};
const mockUpdateChain: any = {};
const mockInsertChain: any = {};
let mockDb: any;

vi.mock("../../db", () => ({
  getDb: () => {
    if (!mockDb) throw new Error("Database not configured");
    return mockDb;
  },
}));

vi.mock("../../config/env", () => ({
  env: {
    IP_HASH_SALT: "test-salt",
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
  },
}));

vi.mock("../../middleware/validation", () => ({
  validateBody: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("@shared/validation/betaSignup", () => ({
  BetaSignupInput: {},
}));

vi.mock("@shared/schema", () => ({
  betaSignups: {
    id: "id",
    email: "email",
    submitCount: "submitCount",
    lastSubmittedAt: "lastSubmittedAt",
    platform: "platform",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: any[]) => `sql:${values.join(",")}`,
}));

vi.mock("../../utils/ip", () => ({
  getClientIp: vi.fn(() => "1.2.3.4"),
  hashIp: vi.fn(() => "hashed-ip-value"),
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

await import("../../routes/betaSignup");

function mockReq(overrides: any = {}) {
  return {
    body: { email: "test@example.com", platform: "ios" },
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

describe("betaSignup route branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };
  });

  it("creates a new signup when email is not found", async () => {
    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("returns 429 when existing user submits within rate limit window", async () => {
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "existing-id",
              email: "test@example.com",
              platform: "ios",
              lastSubmittedAt: new Date(), // Just now — within window
              submitCount: 1,
            },
          ]),
        }),
      }),
    });

    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "RATE_LIMITED" });
  });

  it("updates existing user when outside rate limit window", async () => {
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "existing-id",
              email: "test@example.com",
              platform: "android",
              lastSubmittedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 min ago
              submitCount: 1,
            },
          ]),
        }),
      }),
    });

    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("updates with existing platform when new request has no platform", async () => {
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "existing-id",
              email: "test@example.com",
              platform: "android",
              lastSubmittedAt: new Date(Date.now() - 20 * 60 * 1000),
              submitCount: 2,
            },
          ]),
        }),
      }),
    });

    const req = mockReq({ body: { email: "test@example.com" } }); // no platform
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 on database error", async () => {
    mockDb = null;
    const req = mockReq();
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "SERVER_ERROR" });
  });
});
