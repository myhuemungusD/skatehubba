/**
 * @fileoverview Unit tests for server/routes/users.ts (usersRouter)
 *
 * Tests:
 * - GET /api/users/search — search users by name
 * - GET /api/users — list users
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser ?? { id: "user1", firstName: "Test" };
    next();
  }),
}));

vi.mock("@shared/schema", () => ({
  customUsers: {
    id: "id",
    firstName: "firstName",
    lastName: "lastName",
    isActive: "isActive",
  },
}));

vi.mock("drizzle-orm", () => ({
  ilike: vi.fn(),
  or: vi.fn(),
  eq: vi.fn(),
  and: vi.fn((...args: any[]) => args),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true }), {
    raw: (s: string) => ({ _sql: true, raw: s }),
  }),
}));

// Mock the circuit breaker to execute the function directly with fallback support
vi.mock("../utils/circuitBreaker", () => ({
  userDiscoveryBreaker: {
    execute: vi.fn(async (fn: () => Promise<any>, fallback: any) => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    }),
  },
}));

// Capture route handlers via mock Router
const routeHandlers: Record<string, any[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    get: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`GET ${path}`] = handlers;
    }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../routes/users");

const { getDb } = await import("../db");

// ============================================================================
// Helpers
// ============================================================================

function mockReq(overrides: Record<string, any> = {}) {
  return {
    query: {},
    params: {},
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

function buildSearchDb(results: any[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(results),
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

describe("GET /api/users/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return mapped user results for valid query", async () => {
    const dbResults = [{ id: "u1", firstName: "John", lastName: "Doe" }];
    vi.mocked(getDb).mockReturnValue(buildSearchDb(dbResults) as any);

    const req = mockReq({ query: { q: "John" } });
    const res = mockRes();
    await callHandler("GET /search", req, res);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "u1",
        displayName: "John Doe",
        handle: "useru1",
      }),
    ]);
  });

  it("should escape SQL LIKE wildcards in search query", async () => {
    const dbResults = [{ id: "u1", firstName: "100%", lastName: "User" }];
    vi.mocked(getDb).mockReturnValue(buildSearchDb(dbResults) as any);

    const req = mockReq({ query: { q: "100%" } });
    const res = mockRes();
    await callHandler("GET /search", req, res);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: "u1", displayName: "100% User" }),
    ]);
  });

  it("should return empty array when query is too short", async () => {
    const req = mockReq({ query: { q: "J" } });
    const res = mockRes();
    await callHandler("GET /search", req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("should return empty array when query is missing", async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();
    await callHandler("GET /search", req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("should return empty array when db is unavailable (circuit breaker fallback)", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("Database not configured");
    });

    const req = mockReq({ query: { q: "Test" } });
    const res = mockRes();
    await callHandler("GET /search", req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("should return empty array on db error (circuit breaker fallback)", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("fail");
    });

    const req = mockReq({ query: { q: "Test" } });
    const res = mockRes();
    await callHandler("GET /search", req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("should handle user with only firstName (no lastName)", async () => {
    const dbResults = [{ id: "u2", firstName: "Solo", lastName: null }];
    vi.mocked(getDb).mockReturnValue(buildSearchDb(dbResults) as any);

    const req = mockReq({ query: { q: "Solo" } });
    const res = mockRes();
    await callHandler("GET /search", req, res);

    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ displayName: "Solo" })]);
  });

  it("should handle user with no name at all", async () => {
    const dbResults = [{ id: "u3", firstName: null, lastName: null }];
    vi.mocked(getDb).mockReturnValue(buildSearchDb(dbResults) as any);

    const req = mockReq({ query: { q: "noname" } });
    const res = mockRes();
    await callHandler("GET /search", req, res);

    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ displayName: "Skater" })]);
  });

  it("should return empty array when query param is an array (prevent injection)", async () => {
    const req = mockReq({ query: { q: ["John", "Doe"] } });
    const res = mockRes();
    await callHandler("GET /search", req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });
});

describe("GET /api/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return users list", async () => {
    const dbResults = [{ id: "u1", displayName: "Alice", photoURL: null }];
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(dbResults),
          }),
        }),
      }),
    } as any);

    const req = mockReq();
    const res = mockRes();
    await callHandler("GET /", req, res);

    expect(res.json).toHaveBeenCalledWith(dbResults);
  });

  it("should return empty array when db unavailable (circuit breaker fallback)", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("Database not configured");
    });

    const req = mockReq();
    const res = mockRes();
    await callHandler("GET /", req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("should return empty array on error (circuit breaker fallback)", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("fail");
    });

    const req = mockReq();
    const res = mockRes();
    await callHandler("GET /", req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });
});
