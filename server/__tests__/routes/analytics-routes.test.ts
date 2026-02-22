/**
 * @fileoverview Unit tests for analytics routes
 *
 * Tests:
 * - POST /events — single event ingestion
 * - POST /events/batch — batch event ingestion
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();
let mockDb: any = {
  insert: mockInsert,
};

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

vi.mock("../../middleware/firebaseUid", () => ({
  requireFirebaseUid: (req: any, _res: any, next: any) => {
    req.firebaseUid = req.firebaseUid || "test-uid";
    next();
  },
}));

vi.mock("../../middleware/validation", () => ({
  validateBody: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../../packages/shared/analytics-events", () => ({
  AnalyticsIngestSchema: {},
  AnalyticsBatchSchema: {},
  validateEventProps: vi.fn((name: string, props: any) => {
    if (name === "invalid_event") throw new Error("Invalid props");
    return props || {};
  }),
}));

vi.mock("../../../packages/shared/schema-analytics", () => ({
  analyticsEvents: { _table: "analytics_events" },
}));

vi.mock("../../utils/apiError", () => ({
  Errors: {
    badRequest: (res: any, code: string, msg: string) =>
      res.status(400).json({ error: code, message: msg }),
    internal: (res: any, code: string, msg: string) =>
      res.status(500).json({ error: code, message: msg }),
  },
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

await import("../../routes/analytics");

// ============================================================================
// Helpers
// ============================================================================

function createReq(overrides: any = {}) {
  return {
    firebaseUid: "test-uid",
    body: {},
    ...overrides,
  };
}

function createRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
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

describe("Analytics Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockDb = { insert: mockInsert };
  });

  describe("POST /events", () => {
    it("should insert a valid event and return 204", async () => {
      const req = createReq({
        body: {
          event_id: "evt_1",
          event_name: "spot_viewed",
          occurred_at: "2025-01-01T00:00:00Z",
          properties: { spot_id: "123" },
        },
      });
      const res = createRes();
      await callHandler("POST /events", req, res);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(mockInsert).toHaveBeenCalled();
    });

    it("should return 204 when db is null (fail-open)", async () => {
      mockDb = null;
      const req = createReq({
        body: {
          event_id: "evt_2",
          event_name: "spot_viewed",
          occurred_at: "2025-01-01T00:00:00Z",
          properties: {},
        },
      });
      const res = createRes();
      await callHandler("POST /events", req, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it("should return 400 for invalid properties", async () => {
      const req = createReq({
        body: {
          event_id: "evt_3",
          event_name: "invalid_event",
          occurred_at: "2025-01-01T00:00:00Z",
          properties: {},
        },
      });
      const res = createRes();
      await callHandler("POST /events", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 204 on db insert error (fire-and-forget)", async () => {
      mockOnConflictDoNothing.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        body: {
          event_id: "evt_4",
          event_name: "spot_viewed",
          occurred_at: "2025-01-01T00:00:00Z",
          properties: {},
        },
      });
      const res = createRes();
      await callHandler("POST /events", req, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  describe("POST /events/batch", () => {
    it("should insert valid batch events and return counts", async () => {
      const req = createReq({
        body: [
          {
            event_id: "evt_b1",
            event_name: "spot_viewed",
            occurred_at: "2025-01-01T00:00:00Z",
            properties: {},
          },
          {
            event_id: "evt_b2",
            event_name: "spot_viewed",
            occurred_at: "2025-01-01T00:00:00Z",
            properties: {},
          },
        ],
      });
      const res = createRes();
      await callHandler("POST /events/batch", req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accepted: 2, rejected: 0 }));
    });

    it("should handle mixed valid/invalid batch events", async () => {
      const req = createReq({
        body: [
          {
            event_id: "evt_b3",
            event_name: "spot_viewed",
            occurred_at: "2025-01-01T00:00:00Z",
            properties: {},
          },
          {
            event_id: "evt_b4",
            event_name: "invalid_event",
            occurred_at: "2025-01-01T00:00:00Z",
            properties: {},
          },
        ],
      });
      const res = createRes();
      await callHandler("POST /events/batch", req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accepted: 1, rejected: 1 }));
    });

    it("should return 200 with rejected counts when db is null (fire-and-forget)", async () => {
      mockDb = null;
      const req = createReq({
        body: [
          {
            event_id: "evt_b5",
            event_name: "spot_viewed",
            occurred_at: "2025-01-01T00:00:00Z",
            properties: {},
          },
        ],
      });
      const res = createRes();
      await callHandler("POST /events/batch", req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accepted: 0, rejected: 1 }));
    });

    it("should return 400 for non-array body", async () => {
      const req = createReq({ body: "not-array" });
      const res = createRes();
      await callHandler("POST /events/batch", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 with rejected counts on batch db insert error (fire-and-forget)", async () => {
      mockOnConflictDoNothing.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        body: [
          {
            event_id: "evt_b6",
            event_name: "spot_viewed",
            occurred_at: "2025-01-01T00:00:00Z",
            properties: {},
          },
        ],
      });
      const res = createRes();
      await callHandler("POST /events/batch", req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accepted: 0, rejected: 1 }));
    });
  });
});
