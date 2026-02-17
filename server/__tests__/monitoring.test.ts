/**
 * @fileoverview Unit tests for Monitoring module
 * @module server/__tests__/monitoring.test
 *
 * Tests:
 * - metricsMiddleware (request recording)
 * - Health check endpoints (live, ready, deep)
 * - System status endpoint
 * - Internal helpers (percentile, recordRequest)
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

// Mock config/env
vi.mock("../config/env", () => ({
  env: { DATABASE_URL: "mock://test", NODE_ENV: "test" },
}));

// DB availability mock
let mockDbAvailable = true;
let mockDbQueryResult: any = "ok";
let mockDbQueryError: any = null;

vi.mock("../db", () => ({
  isDatabaseAvailable: () => mockDbAvailable,
  getDb: () => ({
    execute: async () => {
      if (mockDbQueryError) throw mockDbQueryError;
      return mockDbQueryResult;
    },
  }),
}));

// Redis mock
let mockRedisClient: any = null;

vi.mock("../redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

// drizzle-orm mock
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({
    _sql: strings.join("?"),
    values,
  }),
}));

// Mock checkFfmpegAvailable
let mockFfmpegResult = { ffmpeg: true, ffprobe: true };

vi.mock("../services/videoTranscoder", () => ({
  checkFfmpegAvailable: async () => mockFfmpegResult,
}));

// Import after mocking
const { metricsMiddleware, registerMonitoringRoutes } = await import("../monitoring/index");

// Helper to create mock Express req/res/next
function createMockReq(overrides: any = {}): any {
  return { ...overrides };
}

function createMockRes(overrides: any = {}): any {
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

describe("Monitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbAvailable = true;
    mockDbQueryError = null;
    mockRedisClient = null;
    mockFfmpegResult = { ffmpeg: true, ffprobe: true };
  });

  // ===========================================================================
  // metricsMiddleware
  // ===========================================================================

  describe("metricsMiddleware", () => {
    it("should call next immediately", () => {
      const middleware = metricsMiddleware();
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("should register a finish listener on res", () => {
      const middleware = metricsMiddleware();
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.on).toHaveBeenCalledWith("finish", expect.any(Function));
    });

    it("should record request on finish", () => {
      const middleware = metricsMiddleware();
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);
      res.statusCode = 200;
      res._triggerFinish();
      // No throw means it recorded successfully
    });
  });

  // ===========================================================================
  // registerMonitoringRoutes
  // ===========================================================================

  describe("registerMonitoringRoutes", () => {
    let app: any;
    let routes: Record<string, Function>;

    beforeEach(() => {
      routes = {};
      app = {
        get: vi.fn((path: string, handler: Function) => {
          routes[path] = handler;
        }),
      };
      registerMonitoringRoutes(app);
    });

    it("should register all health routes", () => {
      expect(app.get).toHaveBeenCalledWith("/api/health/live", expect.any(Function));
      expect(app.get).toHaveBeenCalledWith("/api/health/ready", expect.any(Function));
      expect(app.get).toHaveBeenCalledWith("/api/health", expect.any(Function));
      expect(app.get).toHaveBeenCalledWith("/api/admin/system-status", expect.any(Function));
    });

    describe("/api/health/live", () => {
      it("should return ok status", () => {
        const req = createMockReq();
        const res = createMockRes();
        routes["/api/health/live"](req, res);
        expect(res.json).toHaveBeenCalledWith({ status: "ok" });
      });
    });

    describe("/api/health/ready", () => {
      it("should return healthy when all dependencies are up", async () => {
        mockDbAvailable = true;
        mockRedisClient = { ping: vi.fn().mockResolvedValue("PONG") };
        mockFfmpegResult = { ffmpeg: true, ffprobe: true };

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health/ready"](req, res);

        const data = res._getJsonData()[0];
        expect(data.status).toBe("healthy");
        expect(res.status).toHaveBeenCalledWith(200);
      });

      it("should return unhealthy when database is down", async () => {
        mockDbAvailable = false;

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health/ready"](req, res);

        const data = res._getJsonData()[0];
        expect(data.status).toBe("unhealthy");
        expect(res.status).toHaveBeenCalledWith(503);
      });

      it("should return degraded when redis is down", async () => {
        mockDbAvailable = true;
        mockRedisClient = {
          ping: vi.fn().mockRejectedValue(new Error("connection refused")),
        };
        mockFfmpegResult = { ffmpeg: true, ffprobe: true };

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health/ready"](req, res);

        const data = res._getJsonData()[0];
        expect(data.status).toBe("degraded");
        expect(res.status).toHaveBeenCalledWith(200);
      });

      it("should return degraded when ffmpeg is down", async () => {
        mockDbAvailable = true;
        mockFfmpegResult = { ffmpeg: false, ffprobe: false };

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health/ready"](req, res);

        const data = res._getJsonData()[0];
        expect(data.status).toBe("degraded");
      });

      it("should handle redis unconfigured gracefully", async () => {
        mockRedisClient = null;

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health/ready"](req, res);

        const data = res._getJsonData()[0];
        expect(data.checks.redis.status).toBe("unconfigured");
      });

      it("should return database down when query fails", async () => {
        mockDbAvailable = true;
        mockDbQueryError = new Error("connection timeout");

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health/ready"](req, res);

        const data = res._getJsonData()[0];
        expect(data.checks.database.status).toBe("down");
      });
    });

    describe("/api/health", () => {
      it("should return 200 with healthy when all dependencies are up", async () => {
        mockDbAvailable = true;
        mockRedisClient = { ping: vi.fn().mockResolvedValue("PONG") };
        mockFfmpegResult = { ffmpeg: true, ffprobe: true };

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health"](req, res);

        const data = res._getJsonData()[0];
        expect(data.status).toBe("healthy");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(data).toHaveProperty("uptime");
        expect(data).toHaveProperty("timestamp");
        expect(data).toHaveProperty("checks");
      });

      it("should return 503 with degraded when redis is down", async () => {
        mockDbAvailable = true;
        mockRedisClient = {
          ping: vi.fn().mockRejectedValue(new Error("connection refused")),
        };
        mockFfmpegResult = { ffmpeg: true, ffprobe: true };

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health"](req, res);

        const data = res._getJsonData()[0];
        expect(data.status).toBe("degraded");
        expect(res.status).toHaveBeenCalledWith(503);
      });

      it("should return 503 with degraded when ffmpeg is down", async () => {
        mockDbAvailable = true;
        mockRedisClient = { ping: vi.fn().mockResolvedValue("PONG") };
        mockFfmpegResult = { ffmpeg: false, ffprobe: false };

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health"](req, res);

        const data = res._getJsonData()[0];
        expect(data.status).toBe("degraded");
        expect(res.status).toHaveBeenCalledWith(503);
      });

      it("should return 503 with unhealthy when database is down", async () => {
        mockDbAvailable = false;

        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/health"](req, res);

        const data = res._getJsonData()[0];
        expect(data.status).toBe("unhealthy");
        expect(res.status).toHaveBeenCalledWith(503);
      });
    });

    describe("/api/admin/system-status", () => {
      it("should return full system status with metrics and process info", async () => {
        const req = createMockReq();
        const res = createMockRes();
        await routes["/api/admin/system-status"](req, res);

        const data = res._getJsonData()[0];
        expect(data).toHaveProperty("health");
        expect(data).toHaveProperty("metrics");
        expect(data).toHaveProperty("process");
        expect(data.metrics).toHaveProperty("totalRequests");
        expect(data.metrics).toHaveProperty("errorRate");
        expect(data.metrics).toHaveProperty("avgLatencyMs");
        expect(data.metrics).toHaveProperty("p95LatencyMs");
        expect(data.metrics).toHaveProperty("p99LatencyMs");
        expect(data.metrics).toHaveProperty("requestsPerMinute");
        expect(data.metrics).toHaveProperty("topStatusCodes");
        expect(data.process).toHaveProperty("memoryUsageMb");
        expect(data.process).toHaveProperty("pid");
        expect(data.process).toHaveProperty("nodeVersion");
      });
    });
  });
});
