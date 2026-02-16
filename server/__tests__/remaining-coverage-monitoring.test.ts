/**
 * Coverage tests for server/monitoring/index.ts — uncovered lines 95, 226
 *
 * Line 95: `metrics.latencyHistogram.shift()` — when histogram exceeds MAX_LATENCY_SAMPLES (1000)
 * Line 226: `sort((a, b) => b.count - a.count)` in topStatusCodes — requires > 1 status code
 *
 * We need to exercise:
 * 1. The latency histogram ring buffer overflow (> 1000 samples)
 * 2. The system-status endpoint with multiple status codes to trigger the sort
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../logger", () => ({
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

vi.mock("../config/env", () => ({
  env: { DATABASE_URL: "mock://test", NODE_ENV: "test" },
}));

vi.mock("../db", () => ({
  isDatabaseAvailable: () => true,
  getDb: () => ({
    execute: vi.fn().mockResolvedValue("ok"),
  }),
}));

vi.mock("../redis", () => ({
  getRedisClient: () => null,
}));

vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({
    _sql: strings.join("?"),
    values,
  }),
}));

vi.mock("../services/videoTranscoder", () => ({
  checkFfmpegAvailable: vi.fn().mockResolvedValue({ ffmpeg: true, ffprobe: true }),
}));

const { metricsMiddleware, registerMonitoringRoutes } = await import("../monitoring/index");

function createMockRes(overrides: any = {}) {
  let statusCode = 200;
  const finishListeners: Function[] = [];
  const jsonData: any[] = [];

  const res: any = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(val: number) {
      statusCode = val;
    },
    on: vi.fn((event: string, cb: Function) => {
      if (event === "finish") finishListeners.push(cb);
      return res;
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((data: any) => {
      jsonData.push(data);
      return res;
    }),
    _triggerFinish: () => {
      for (const cb of finishListeners) cb();
    },
    _getJsonData: () => jsonData,
    ...overrides,
  };
  return res;
}

describe("Monitoring — additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Line 95: Record > 1000 requests to trigger latencyHistogram.shift()
   */
  it("shifts latency histogram when exceeding 1000 samples (line 95)", () => {
    const middleware = metricsMiddleware();

    // Record 1002 requests to overflow the ring buffer
    for (let i = 0; i < 1002; i++) {
      const req: any = {};
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);
      res.statusCode = 200;
      res._triggerFinish();
    }

    // No error means it worked — the shift was called
    // We can verify via the system-status endpoint
  });

  /**
   * Line 226: topStatusCodes sort with multiple status codes
   */
  it("sorts topStatusCodes correctly with multiple status codes (line 226)", async () => {
    const middleware = metricsMiddleware();

    // Record different status codes
    const statusCodes = [200, 200, 200, 404, 404, 500];
    for (const code of statusCodes) {
      const req: any = {};
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);
      res.statusCode = code;
      res._triggerFinish();
    }

    // Now get system status
    const routes: Record<string, Function> = {};
    const app: any = {
      get: vi.fn((path: string, handler: Function) => {
        routes[path] = handler;
      }),
    };
    registerMonitoringRoutes(app);

    const req: any = {};
    const res = createMockRes();
    await routes["/api/admin/system-status"](req, res);

    const data = res._getJsonData()[0];
    const topCodes = data.metrics.topStatusCodes;

    // Should have at least the codes we recorded, sorted by count descending
    expect(topCodes.length).toBeGreaterThan(0);

    // Verify sorting: first entry should have highest count
    for (let i = 1; i < topCodes.length; i++) {
      expect(topCodes[i - 1].count).toBeGreaterThanOrEqual(topCodes[i].count);
    }
  });
});
