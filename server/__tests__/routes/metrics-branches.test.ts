/**
 * @fileoverview Additional branch coverage for server/routes/metrics.ts
 *
 * Covers the remaining uncovered error and empty-result branches in:
 * - GET /response-rate (lines 106-110)
 * - GET /votes-per-battle (lines 128-132)
 * - GET /crew-join-rate empty result
 * - GET /retention empty result
 * - GET /kpi error path
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.fn();
let mockDb: any = { execute: mockExecute };

vi.mock("../../db", () => ({
  get db() {
    return mockDb;
  },
  getDb: () => {
    if (!mockDb) throw new Error("Database not configured");
    return mockDb;
  },
  isDatabaseAvailable: vi.fn(() => true),
}));

vi.mock("drizzle-orm", () => ({
  sql: { raw: (s: string) => ({ _sql: true, raw: s }) },
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1", roles: [] };
    next();
  },
}));

vi.mock("../../analytics/queries", () => ({
  WAB_AU_SNAPSHOT: "SELECT_WAB_AU",
  WAB_AU_TREND_12_WEEKS: "SELECT_TREND",
  UPLOADS_WITH_RESPONSE_48H: "SELECT_RESPONSE",
  VOTES_PER_BATTLE: "SELECT_VOTES",
  CREW_JOIN_RATE: "SELECT_CREW",
  D7_RETENTION: "SELECT_RETENTION",
  KPI_DASHBOARD: "SELECT_KPI",
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../utils/apiError", () => ({
  Errors: {
    forbidden: (res: any, code: string, msg: string) =>
      res.status(403).json({ error: code, message: msg }),
    internal: (res: any, code: string, msg: string) =>
      res.status(500).json({ error: code, message: msg }),
  },
}));

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

await import("../../routes/metrics");

function createReq(overrides: any = {}) {
  return {
    currentUser: { id: "admin-1", roles: ["admin"] },
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

describe("Metrics Routes — additional branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [] });
    mockDb = { execute: mockExecute };
  });

  describe("GET /response-rate", () => {
    it("should return empty object when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /response-rate", req, res);
      expect(res.json).toHaveBeenCalledWith({});
    });

    it("should return 500 on db error", async () => {
      mockExecute.mockRejectedValue(new Error("timeout"));
      const req = createReq();
      const res = createRes();
      await callHandler("GET /response-rate", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 500 when db is null (getDb throws)", async () => {
      mockDb = null;
      const req = createReq();
      const res = createRes();
      await callHandler("GET /response-rate", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("GET /votes-per-battle", () => {
    it("should return empty object when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /votes-per-battle", req, res);
      expect(res.json).toHaveBeenCalledWith({});
    });

    it("should return 500 on db error", async () => {
      mockExecute.mockRejectedValue(new Error("fail"));
      const req = createReq();
      const res = createRes();
      await callHandler("GET /votes-per-battle", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 500 when db is null (getDb throws)", async () => {
      mockDb = null;
      const req = createReq();
      const res = createRes();
      await callHandler("GET /votes-per-battle", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("GET /retention", () => {
    it("should return empty object when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /retention", req, res);
      expect(res.json).toHaveBeenCalledWith({});
    });
  });

  describe("GET /crew-join-rate", () => {
    it("should return empty object when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /crew-join-rate", req, res);
      expect(res.json).toHaveBeenCalledWith({});
    });

    it("should return 500 when db is null (getDb throws)", async () => {
      mockDb = null;
      const req = createReq();
      const res = createRes();
      await callHandler("GET /crew-join-rate", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("GET /kpi", () => {
    it("should return 500 on db error", async () => {
      mockExecute.mockRejectedValue(new Error("timeout"));
      const req = createReq();
      const res = createRes();
      await callHandler("GET /kpi", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 500 when db is null (getDb throws)", async () => {
      mockDb = null;
      const req = createReq();
      const res = createRes();
      await callHandler("GET /kpi", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("requireAdmin — edge cases", () => {
    it("should reject null currentUser", async () => {
      const req = createReq({ currentUser: null });
      const res = createRes();
      await callHandler("GET /wab-au", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
