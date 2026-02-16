/**
 * @fileoverview Unit tests for feed cache middleware
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockSetex = vi.fn();
const mockRedisClient = { get: mockGet, setex: mockSetex };
const mockGetRedisClient = vi.fn();

vi.mock("../redis", () => ({
  getRedisClient: () => mockGetRedisClient(),
}));

vi.mock("../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

const { feedCache } = await import("../middleware/feedCache");

function createReq(overrides: any = {}) {
  return {
    method: "GET",
    originalUrl: "/api/feed?limit=10",
    preferredQuality: "medium",
    ...overrides,
  } as any;
}

function createRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader: vi.fn((k: string, v: string) => {
      res.headers[k] = v;
    }),
    send: vi.fn(),
    json: vi.fn(),
  };
  return res;
}

describe("feedCache middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue(mockRedisClient);
    mockGet.mockResolvedValue(null);
    mockSetex.mockResolvedValue("OK");
  });

  it("should skip non-GET requests", async () => {
    const middleware = feedCache(30);
    const req = createReq({ method: "POST" });
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("should skip when redis is unavailable", async () => {
    mockGetRedisClient.mockReturnValue(null);
    const middleware = feedCache(30);
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("should return cached response on cache hit", async () => {
    const cachedData = JSON.stringify({ clips: [], total: 0 });
    mockGet.mockResolvedValue(cachedData);

    const middleware = feedCache(30);
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("X-Cache", "HIT");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
    expect(res.send).toHaveBeenCalledWith(cachedData);
  });

  it("should pass through and cache on miss", async () => {
    const middleware = feedCache(30);
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    // res.json should be intercepted
    const body = { clips: [{ id: 1 }], total: 1 };
    res.json(body);

    expect(res.setHeader).toHaveBeenCalledWith("X-Cache", "MISS");
    // Wait for async cache write
    await vi.waitFor(() => {
      expect(mockSetex).toHaveBeenCalledWith(
        expect.stringContaining("feed:"),
        30,
        JSON.stringify(body)
      );
    });
  });

  it("should not cache error responses", async () => {
    const middleware = feedCache(30);
    const req = createReq();
    const res = createRes();
    res.statusCode = 500;
    const next = vi.fn();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    res.json({ error: "Internal error" });
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it("should not cache responses with error field", async () => {
    const middleware = feedCache(30);
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    res.json({ error: "Something failed" });
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it("should handle redis read errors gracefully", async () => {
    mockGet.mockRejectedValue(new Error("Redis connection lost"));

    const middleware = feedCache(30);
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should handle redis write errors gracefully", async () => {
    mockSetex.mockRejectedValue(new Error("Redis write failed"));

    const middleware = feedCache(30);
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    // Should not throw when json is called
    res.json({ clips: [], total: 0 });
  });

  it("should include quality in cache key", async () => {
    const middleware = feedCache(30);
    const req = createReq({ preferredQuality: "low" });
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("q=low"));
  });

  it("should default quality to medium when not set", async () => {
    const middleware = feedCache(30);
    const req = createReq({ preferredQuality: undefined });
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("q=medium"));
  });

  it("should use default TTL when not specified", async () => {
    const middleware = feedCache();
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    res.json({ clips: [] });

    await vi.waitFor(() => {
      expect(mockSetex).toHaveBeenCalledWith(expect.any(String), 30, expect.any(String));
    });
  });
});
