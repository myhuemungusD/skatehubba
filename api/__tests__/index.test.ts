/**
 * @fileoverview Tests for server/vercel-handler.ts — Vercel serverless function entry point
 *
 * Coverage targets:
 * - Happy path: delegates to Express handler when init succeeds
 * - Error path: returns structured JSON 500 when createApp() fails
 * - Security headers on error response
 * - Detail always included in error response (env validation errors contain
 *   variable names and rules only — no secret values are echoed)
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

    const mod = await import("../../server/vercel-handler");
    const req = mockReq();
    const res = mockRes();

    await mod.default(req, res as unknown as ServerResponse);

    expect(mockExpressHandler).toHaveBeenCalledWith(req, res);
  });

  it("does NOT set error headers when handler succeeds", async () => {
    const mockExpressHandler = vi.fn();

    vi.doMock("../../server/app.ts", () => ({
      createApp: () => mockExpressHandler,
    }));

    const mod = await import("../../server/vercel-handler");
    const res = mockRes();

    await mod.default(mockReq(), res as unknown as ServerResponse);

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
    const mod = await import("../../server/vercel-handler");
    const res = mockRes();

    await mod.default(mockReq(), res as unknown as ServerResponse);

    expect((res as unknown as MockRes).statusCode).toBe(500);
    const body = parseBody(res as unknown as MockRes);
    expect(body.error).toBe("SERVER_INIT_FAILED");
    expect(body.message).toMatch(/check environment variables/i);
    expect(body.hint).toMatch(/health\/env/);

    consoleErrorSpy.mockRestore();
  });

  it("includes security headers on error response", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("../../server/vercel-handler");
    const res = mockRes();

    await mod.default(mockReq(), res as unknown as ServerResponse);

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
    const mod = await import("../../server/vercel-handler");
    const res = mockRes();

    await mod.default(mockReq(), res as unknown as ServerResponse);

    const bodyStr = (res as unknown as MockRes)._body;
    expect((res as unknown as MockRes)._headers["Content-Length"]).toBe(Buffer.byteLength(bodyStr));

    consoleErrorSpy.mockRestore();
  });

  it("logs error to console.error during init", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mod = await import("../../server/vercel-handler");
    // Trigger init by calling the handler
    await mod.default(mockReq(), mockRes() as unknown as ServerResponse);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[api/index] Server initialization failed:"),
      INIT_ERROR_MSG
    );

    consoleErrorSpy.mockRestore();
  });

  describe("error detail in response", () => {
    it("always includes error detail regardless of environment", async () => {
      // Detail is always shown because env validation errors contain only variable
      // names and validation rules — never actual secret values. The operational
      // benefit (diagnosing prod failures without log access) outweighs the marginal
      // risk of exposing internal error text.
      process.env.VERCEL_ENV = "production";
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mod = await import("../../server/vercel-handler");
      const res = mockRes();

      await mod.default(mockReq(), res as unknown as ServerResponse);

      const body = parseBody(res as unknown as MockRes);
      expect(body.detail).toBe(INIT_ERROR_MSG);

      consoleErrorSpy.mockRestore();
    });

    it("includes detail in preview environments", async () => {
      process.env.VERCEL_ENV = "preview";
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mod = await import("../../server/vercel-handler");
      const res = mockRes();

      await mod.default(mockReq(), res as unknown as ServerResponse);

      const body = parseBody(res as unknown as MockRes);
      expect(body.detail).toBe(INIT_ERROR_MSG);

      consoleErrorSpy.mockRestore();
    });

    it("includes detail in local dev (no VERCEL_ENV)", async () => {
      delete process.env.VERCEL_ENV;
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mod = await import("../../server/vercel-handler");
      const res = mockRes();

      await mod.default(mockReq(), res as unknown as ServerResponse);

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
    const mod = await import("../../server/vercel-handler");
    const res = mockRes();

    await mod.default(mockReq(), res as unknown as ServerResponse);

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

    const mod = await import("../../server/vercel-handler");
    // Trigger init by calling the handler
    await mod.default(mockReq(), mockRes() as unknown as ServerResponse);

    // Should have logged both message and stack
    const calls = consoleErrorSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c: string) => c.includes("Stack trace:"))).toBe(true);

    consoleErrorSpy.mockRestore();
  });

  it("omits missingEnvVars when all required vars are set", async () => {
    vi.doMock("../../server/app.ts", () => ({
      createApp: () => {
        throw new Error("some error");
      },
    }));

    process.env.DATABASE_URL = "postgres://localhost/test";
    process.env.SESSION_SECRET = "secret";
    process.env.JWT_SECRET = "jwt";
    process.env.MFA_ENCRYPTION_KEY = "mfa";
    process.env.IP_HASH_SALT = "abcdef1234567890";
    delete process.env.VERCEL_ENV;

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("../../server/vercel-handler");
    const res = mockRes();

    await mod.default(mockReq(), res as unknown as ServerResponse);

    const body = parseBody(res as unknown as MockRes);
    expect(body.missingEnvVars).toBeUndefined();

    consoleErrorSpy.mockRestore();
  });

  it("does not log stack trace when error has no stack", async () => {
    vi.doMock("../../server/app.ts", () => ({
      createApp: () => {
        // Use Object.defineProperty to prevent V8 from re-adding the stack
        const err = new Error("no stack");
        Object.defineProperty(err, "stack", { value: undefined, writable: false });
        throw err;
      },
    }));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mod = await import("../../server/vercel-handler");
    // Trigger init by calling the handler
    await mod.default(mockReq(), mockRes() as unknown as ServerResponse);

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
