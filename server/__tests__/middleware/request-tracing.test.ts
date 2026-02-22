/**
 * @fileoverview Unit tests for request tracing middleware
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../../logger.ts", () => ({
  createChildLogger: vi.fn((ctx: any) => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
    _context: ctx,
  })),
}));

const { requestTracing } = await import("../../middleware/requestTracing");

// ============================================================================
// Helpers
// ============================================================================

function createReq(overrides: any = {}) {
  return {
    headers: {},
    method: "GET",
    originalUrl: "/api/test",
    requestId: undefined as string | undefined,
    log: undefined as any,
    ...overrides,
  };
}

function createRes() {
  const listeners: Record<string, Function[]> = {};
  return {
    statusCode: 200,
    setHeader: vi.fn(),
    on: vi.fn((event: string, cb: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    emit: (event: string) => {
      (listeners[event] || []).forEach((cb) => cb());
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Request Tracing Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a UUID if no X-Request-ID header", () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn();

    requestTracing(req as any, res as any, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(next).toHaveBeenCalled();
  });

  it("should preserve existing X-Request-ID header", () => {
    const req = createReq({
      headers: { "x-request-id": "custom-trace-123" },
    });
    const res = createRes();
    const next = vi.fn();

    requestTracing(req as any, res as any, next);

    expect(req.requestId).toBe("custom-trace-123");
  });

  it("should trim whitespace from existing header", () => {
    const req = createReq({
      headers: { "x-request-id": "  trace-456  " },
    });
    const res = createRes();
    const next = vi.fn();

    requestTracing(req as any, res as any, next);

    expect(req.requestId).toBe("trace-456");
  });

  it("should generate UUID for empty string header", () => {
    const req = createReq({
      headers: { "x-request-id": "   " },
    });
    const res = createRes();
    const next = vi.fn();

    requestTracing(req as any, res as any, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).not.toBe("");
  });

  it("should set X-Request-ID response header", () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn();

    requestTracing(req as any, res as any, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", req.requestId);
  });

  it("should attach a child logger with requestId", () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn();

    requestTracing(req as any, res as any, next);

    expect(req.log).toBeDefined();
    expect(req.log._context).toEqual({ requestId: req.requestId });
  });

  it("should log request completion on response finish", () => {
    const req = createReq({ method: "POST", originalUrl: "/api/users" });
    const res = createRes();
    const next = vi.fn();

    requestTracing(req as any, res as any, next);

    // Emit finish event
    res.emit("finish");

    expect(req.log.info).toHaveBeenCalledWith(
      "request completed",
      expect.objectContaining({
        method: "POST",
        url: "/api/users",
        status: 200,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should call next()", () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn();

    requestTracing(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
