/**
 * @fileoverview Unit tests for metrics routes
 *
 * Tests admin-only KPI endpoints:
 * GET /wab-au, /wab-au/trend, /kpi, /response-rate, /votes-per-battle, /crew-join-rate, /retention
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockExecute = vi.fn();
let mockDb: any = { execute: mockExecute };

vi.mock("../../db", () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: { raw: (s: string) => ({ _sql: true, raw: s }) },
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1", roles: [] };
    next();
  },
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
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
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../utils/apiError", () => ({
  Errors: {
    forbidden: (res: any, code: string, msg: string) =>
      res.status(403).json({ error: code, message: msg }),
    internal: (res: any, code: string, msg: string) =>
      res.status(500).json({ error: code, message: msg }),
    dbUnavailable: (res: any) => res.status(503).json({ error: "DATABASE_UNAVAILABLE" }),
  },
}));

// Capture route handlers
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

// ============================================================================
// Helpers
// ============================================================================

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

// ============================================================================
// Tests
// ============================================================================

describe("Metrics Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [{ wab: 10, au: 20, wab_per_au: 0.5 }] });
    mockDb = { execute: mockExecute };
  });

  describe("requireAdmin middleware", () => {
    it("should reject non-admin users with 403", async () => {
      const req = createReq({ currentUser: { id: "user-1", roles: [] } });
      const res = createRes();
      await callHandler("GET /wab-au", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should reject users with no roles", async () => {
      const req = createReq({ currentUser: { id: "user-1" } });
      const res = createRes();
      await callHandler("GET /wab-au", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("GET /wab-au", () => {
    it("should return WAB/AU snapshot for admin", async () => {
      const req = createReq();
      const res = createRes();
      await callHandler("GET /wab-au", req, res);
      expect(res.json).toHaveBeenCalledWith({ wab: 10, au: 20, wab_per_au: 0.5 });
    });

    it("should return default values when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /wab-au", req, res);
      expect(res.json).toHaveBeenCalledWith({ wab: 0, au: 0, wab_per_au: 0 });
    });

    it("should return 503 when db is null", async () => {
      mockDb = null;
      const req = createReq();
      const res = createRes();
      await callHandler("GET /wab-au", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on db error", async () => {
      mockExecute.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await callHandler("GET /wab-au", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("GET /wab-au/trend", () => {
    it("should return trend data", async () => {
      const rows = [{ week_start: "2025-01-06", wab: 5, au: 10 }];
      mockExecute.mockResolvedValue({ rows });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /wab-au/trend", req, res);
      expect(res.json).toHaveBeenCalledWith(rows);
    });

    it("should return 503 when db is null", async () => {
      mockDb = null;
      const req = createReq();
      const res = createRes();
      await callHandler("GET /wab-au/trend", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockExecute.mockRejectedValue(new Error("timeout"));
      const req = createReq();
      const res = createRes();
      await callHandler("GET /wab-au/trend", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("GET /kpi", () => {
    it("should return KPI dashboard data", async () => {
      const kpi = { wab: 10, au: 20, wab_per_au: 0.5, avg_votes: 3 };
      mockExecute.mockResolvedValue({ rows: [kpi] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /kpi", req, res);
      expect(res.json).toHaveBeenCalledWith(kpi);
    });

    it("should return empty object when no data", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /kpi", req, res);
      expect(res.json).toHaveBeenCalledWith({});
    });
  });

  describe("GET /response-rate", () => {
    it("should return response rate data", async () => {
      const data = { total_uploads: 100, pct_uploads_with_response_48h: 0.35 };
      mockExecute.mockResolvedValue({ rows: [data] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /response-rate", req, res);
      expect(res.json).toHaveBeenCalledWith(data);
    });
  });

  describe("GET /votes-per-battle", () => {
    it("should return votes data", async () => {
      const data = { total_battles: 50, avg_votes_per_battle: 6.2 };
      mockExecute.mockResolvedValue({ rows: [data] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /votes-per-battle", req, res);
      expect(res.json).toHaveBeenCalledWith(data);
    });
  });

  describe("GET /crew-join-rate", () => {
    it("should return crew join rate", async () => {
      const data = { wau: 100, joiners: 30, crew_join_rate: 0.3 };
      mockExecute.mockResolvedValue({ rows: [data] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /crew-join-rate", req, res);
      expect(res.json).toHaveBeenCalledWith(data);
    });

    it("should return 500 on db error", async () => {
      mockExecute.mockRejectedValue(new Error("fail"));
      const req = createReq();
      const res = createRes();
      await callHandler("GET /crew-join-rate", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("GET /retention", () => {
    it("should return retention data", async () => {
      const data = { cohort_size: 200, d7_active: 30, d7_retention_rate: 0.15 };
      mockExecute.mockResolvedValue({ rows: [data] });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /retention", req, res);
      expect(res.json).toHaveBeenCalledWith(data);
    });

    it("should return 503 when db is null", async () => {
      mockDb = null;
      const req = createReq();
      const res = createRes();
      await callHandler("GET /retention", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });
});
