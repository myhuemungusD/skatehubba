/**
 * @fileoverview Tests for api/index.ts — Vercel serverless function entry point
 *
 * Coverage targets:
 * - Happy path: delegates to Express handler when init succeeds
 * - Error path: returns structured JSON 500 when createApp() fails
 * - Security headers on error response
 * - Detail suppression in deployed environments (VERCEL_ENV set)
 * - Detail exposure in local development (VERCEL_ENV unset)
 * - Error logging to console.error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Helpers — mock node:http request/response
// ---------------------------------------------------------------------------

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    url: "/api/test",
    method: "GET",
    ...overrides,
  } as unknown as IncomingMessage;
}

interface MockRes {
  writeHead: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  statusCode: number;
  _body: string;
  _headers: Record<string, string>;
}

function mockRes(): MockRes & ServerResponse {
  const res: MockRes = {
    statusCode: 200,
    _body: "",
    _headers: {},
    writeHead: vi.fn((status: number, headers?: Record<string, string>) => {
      res.statusCode = status;
      if (headers) res._headers = headers;
    }),
    end: vi.fn((body?: string) => {
      if (body) res._body = body;
    }),
  };
  return res as unknown as MockRes & ServerResponse;
}

function parseBody(res: MockRes): Record<string, unknown> {
  return JSON.parse(res._body);
}

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  vi.resetModules();
});

afterEach(() => {
  process.env = savedEnv;
});

// ===========================================================================
// Happy Path — Express handler initialized successfully
// ===========================================================================

describe("api/index: successful init", () => {
  it("delegates to the Express handler when createApp succeeds", async () => {
    const mockExpressHandler = vi.fn();

    vi.doMock("../../server/app.ts", () => ({
      createApp: () => mockExpressHandler,
    }));

    const mod = await import("../index");
    const req = mockReq();
    const res = mockRes();

    mod.default(req, res as unknown as ServerResponse);

    expect(mockExpressHandler).toHaveBeenCalledWith(req, res);
  });

  it("does NOT set error headers when handler succeeds", async () => {
    const mockExpressHandler = vi.fn();

    vi.doMock("../../server/app.ts", () => ({
      createApp: () => mockExpressHandler,
    }));

    const mod = await import("../index");
    const res = mockRes();

    mod.default(mockReq(), res as unknown as ServerResponse);

    // writeHead should NOT have been called by our handler
    expect((res as unknown as MockRes).writeHead).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Error Path — createApp() throws
// ===========================================================================

describe("api/index: init failure", () => {
  const INIT_ERROR_MSG = "DATABASE_URL is required";

  beforeEach(() => {
    vi.doMock("../../server/app.ts", () => ({
      createApp: () => {
        throw new Error(INIT_ERROR_MSG);
      },
    }));
  });

  it("returns 500 with structured JSON when createApp fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("../index");
    const res = mockRes();

    mod.default(mockReq(), res as unknown as ServerResponse);

    expect((res as unknown as MockRes).statusCode).toBe(500);
    const body = parseBody(res as unknown as MockRes);
    expect(body.error).toBe("SERVER_INIT_FAILED");
    expect(body.message).toMatch(/check environment variables/i);
    expect(body.hint).toMatch(/env-check/);

    consoleErrorSpy.mockRestore();
  });

  it("includes security headers on error response", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("../index");
    const res = mockRes();

    mod.default(mockReq(), res as unknown as ServerResponse);

    expect((res as unknown as MockRes)._headers).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Type": "application/json",
    });

    consoleErrorSpy.mockRestore();
  });

  it("sets Content-Length header using Buffer.byteLength", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("../index");
    const res = mockRes();

    mod.default(mockReq(), res as unknown as ServerResponse);

    const bodyStr = (res as unknown as MockRes)._body;
    const expectedLength = Buffer.byteLength(bodyStr).toString();
    expect((res as unknown as MockRes)._headers["Content-Length"]).toBe(Buffer.byteLength(bodyStr));

    consoleErrorSpy.mockRestore();
  });

  it("logs error to console.error during init", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("../index");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[api/index] Server initialization failed:"),
      INIT_ERROR_MSG
    );

    consoleErrorSpy.mockRestore();
  });

  describe("detail suppression based on VERCEL_ENV", () => {
    it("hides error detail when VERCEL_ENV is set (production)", async () => {
      process.env.VERCEL_ENV = "production";
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mod = await import("../index");
      const res = mockRes();

      mod.default(mockReq(), res as unknown as ServerResponse);

      const body = parseBody(res as unknown as MockRes);
      expect(body.detail).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(INIT_ERROR_MSG);

      consoleErrorSpy.mockRestore();
    });

    it("hides error detail when VERCEL_ENV is 'preview'", async () => {
      process.env.VERCEL_ENV = "preview";
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mod = await import("../index");
      const res = mockRes();

      mod.default(mockReq(), res as unknown as ServerResponse);

      const body = parseBody(res as unknown as MockRes);
      expect(body.detail).toBeUndefined();

      consoleErrorSpy.mockRestore();
    });

    it("exposes error detail in local dev (no VERCEL_ENV)", async () => {
      delete process.env.VERCEL_ENV;
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mod = await import("../index");
      const res = mockRes();

      mod.default(mockReq(), res as unknown as ServerResponse);

      const body = parseBody(res as unknown as MockRes);
      expect(body.detail).toBe(INIT_ERROR_MSG);

      consoleErrorSpy.mockRestore();
    });
  });
});

// ===========================================================================
// Edge Cases
// ===========================================================================

describe("api/index: edge cases", () => {
  it("handles non-Error throws from createApp", async () => {
    vi.doMock("../../server/app.ts", () => ({
      createApp: () => {
        throw "string error";
      },
    }));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.VERCEL_ENV;
    const mod = await import("../index");
    const res = mockRes();

    mod.default(mockReq(), res as unknown as ServerResponse);

    const body = parseBody(res as unknown as MockRes);
    expect(body.error).toBe("SERVER_INIT_FAILED");
    expect(body.detail).toBe("string error");

    consoleErrorSpy.mockRestore();
  });

  it("logs stack trace when available", async () => {
    vi.doMock("../../server/app.ts", () => ({
      createApp: () => {
        throw new Error("with stack");
      },
    }));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("../index");

    // Should have logged both message and stack
    const calls = consoleErrorSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c: string) => c.includes("Stack trace:"))).toBe(true);

    consoleErrorSpy.mockRestore();
  });

  it("does not log stack trace when error has no stack", async () => {
    vi.doMock("../../server/app.ts", () => ({
      createApp: () => {
        const err = new Error("no stack");
        err.stack = undefined;
        throw err;
      },
    }));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("../index");

    const calls = consoleErrorSpy.mock.calls.map((c) => c[0]);
    expect(
      calls.some((c: string) => typeof c === "string" && c.includes("initialization failed"))
    ).toBe(true);
    expect(calls.some((c: string) => typeof c === "string" && c.includes("Stack trace:"))).toBe(
      false
    );

    consoleErrorSpy.mockRestore();
  });
});
