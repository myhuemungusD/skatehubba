/**
 * @fileoverview Unit tests for server/routes/betaSignup.ts (betaSignupRouter)
 *
 * Tests POST /api/beta-signup — sign up for the beta waitlist
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../config/env", () => ({
  env: { IP_HASH_SALT: "test-salt", NODE_ENV: "test" },
}));

vi.mock("../middleware/validation", () => ({
  validateBody: vi.fn(() => (req: any, _res: any, next: any) => {
    req.validatedBody = req.body;
    next();
  }),
}));

vi.mock("@shared/validation/betaSignup", () => ({
  BetaSignupInput: {} as any,
}));

vi.mock("@shared/schema", () => ({
  betaSignups: {
    id: "id",
    email: "email",
    submitCount: "submitCount",
    lastSubmittedAt: "lastSubmittedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true }), {
    raw: (s: string) => ({ _sql: true, raw: s }),
  }),
}));

vi.mock("../utils/ip", () => ({
  getClientIp: vi.fn(() => "1.2.3.4"),
  hashIp: vi.fn(() => "hashed-ip"),
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

await import("../routes/betaSignup");

const { getDb } = await import("../db");
const { hashIp } = await import("../utils/ip");
const { env } = await import("../config/env");

// ============================================================================
// Helpers
// ============================================================================

function mockReq(overrides: Record<string, any> = {}) {
  return {
    body: {},
    headers: {},
    ip: "127.0.0.1",
    ...overrides,
  };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function buildMockDb(
  options: {
    selectResult?: any[];
    insertReject?: Error;
    updateReject?: Error;
  } = {}
) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(options.selectResult ?? []),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation(() => {
        if (options.insertReject) return Promise.reject(options.insertReject);
        return Promise.resolve();
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          if (options.updateReject) return Promise.reject(options.updateReject);
          return Promise.resolve();
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

describe("POST /api/beta-signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a new beta signup and return ok", async () => {
    const db = buildMockDb({ selectResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const req = mockReq({
      body: { email: "new@test.com", platform: "ios" },
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(getDb).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("should return 429 when existing signup is within rate limit window", async () => {
    const recentDate = new Date();
    const existing = {
      id: "abc",
      email: "dup@test.com",
      platform: "ios",
      lastSubmittedAt: recentDate,
    };
    const db = buildMockDb({ selectResult: [existing] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const req = mockReq({
      body: { email: "dup@test.com", platform: "ios" },
    });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "RATE_LIMITED" });
  });

  it("should update existing signup when outside rate limit window", async () => {
    const oldDate = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
    const existing = {
      id: "abc",
      email: "old@test.com",
      platform: "android",
      lastSubmittedAt: oldDate,
    };
    const db = buildMockDb({ selectResult: [existing] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const req = mockReq({
      body: { email: "old@test.com", platform: "ios" },
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(db.update).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("should return 500 on database error", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("DB connection lost");
    });

    const req = mockReq({
      body: { email: "err@test.com", platform: "ios" },
    });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "SERVER_ERROR" });
  });

  it("should pass hashed IP to database insert for new signups", async () => {
    const db = buildMockDb({ selectResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const req = mockReq({
      body: { email: "hash@test.com", platform: "ios" },
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(hashIp).toHaveBeenCalled();
    const insertValues = db.insert.mock.results[0]?.value.values.mock.calls[0][0];
    expect(insertValues).toHaveProperty("ipHash", "hashed-ip");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should omit ipHash when IP_HASH_SALT is empty", async () => {
    const originalSalt = env.IP_HASH_SALT;
    (env as any).IP_HASH_SALT = "";

    const db = buildMockDb({ selectResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const req = mockReq({
      body: { email: "nosalt@test.com", platform: "android" },
    });
    const res = mockRes();
    await callHandler("POST /", req, res);

    const insertValues = db.insert.mock.results[0]?.value.values.mock.calls[0][0];
    expect(insertValues).not.toHaveProperty("ipHash");
    expect(res.status).toHaveBeenCalledWith(200);

    (env as any).IP_HASH_SALT = originalSalt;
  });
});
