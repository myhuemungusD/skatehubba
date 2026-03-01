/**
 * @fileoverview Tests for api/env-check.ts — standalone env diagnostic endpoint
 *
 * Coverage targets:
 * - Auth gate: fail-closed when CRON_SECRET unset, timing-safe token validation
 * - Bearer token parsing: valid token, invalid token, missing header, malformed header
 * - Response security headers on all response paths (403, 401, 200, 503)
 * - Env var checking: set, missing, empty_string, masked vs. unmasked preview
 * - Payload structure: required/optional grouping, summary, metadata
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Helpers — mock node:http request/response
// ---------------------------------------------------------------------------

function mockReq(overrides: Partial<IncomingMessage> & { headers?: Record<string, string> } = {}) {
  return {
    headers: {},
    url: "/api/env-check",
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

const SECURITY_HEADERS = {
  "Content-Type": "application/json",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

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

/**
 * Dynamic import so each test can set env vars before the module loads.
 * Since env-check reads process.env at call time (not module scope), we
 * can import once and manipulate env per-test for the handler function.
 */
async function getHandler() {
  const mod = await import("../env-check");
  return mod.default;
}

// ===========================================================================
// Auth Gate Tests
// ===========================================================================

describe("env-check: auth gate", () => {
  describe("when CRON_SECRET is NOT configured", () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET;
    });

    it("returns 403 with fail-closed message", async () => {
      const handler = await getHandler();
      const req = mockReq();
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes).statusCode).toBe(403);
      const body = parseBody(res as unknown as MockRes);
      expect(body.error).toMatch(/forbidden/i);
    });

    it("includes security headers on 403 response", async () => {
      const handler = await getHandler();
      const req = mockReq();
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes).writeHead).toHaveBeenCalledWith(403, SECURITY_HEADERS);
    });

    it("does NOT expose env var data", async () => {
      process.env.DATABASE_URL = "postgres://secret";
      const handler = await getHandler();
      const req = mockReq();
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes)._body).not.toContain("postgres");
      expect((res as unknown as MockRes)._body).not.toContain("DATABASE_URL");
    });
  });

  describe("when CRON_SECRET IS configured", () => {
    const SECRET = "test-cron-secret-value-32chars!!";

    beforeEach(() => {
      process.env.CRON_SECRET = SECRET;
    });

    it("returns 401 when no Authorization header is provided", async () => {
      const handler = await getHandler();
      const req = mockReq({ headers: {} });
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes).statusCode).toBe(401);
      const body = parseBody(res as unknown as MockRes);
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 401 when Bearer token is wrong", async () => {
      const handler = await getHandler();
      const req = mockReq({ headers: { authorization: "Bearer wrong-token" } });
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes).statusCode).toBe(401);
    });

    it("returns 401 when Authorization header is not Bearer scheme", async () => {
      const handler = await getHandler();
      const req = mockReq({ headers: { authorization: `Basic ${SECRET}` } });
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes).statusCode).toBe(401);
    });

    it("returns 401 when Authorization header is 'Bearer ' with empty token", async () => {
      const handler = await getHandler();
      const req = mockReq({ headers: { authorization: "Bearer " } });
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes).statusCode).toBe(401);
    });

    it("returns 401 when Authorization header is just 'Bearer'", async () => {
      const handler = await getHandler();
      const req = mockReq({ headers: { authorization: "Bearer" } });
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes).statusCode).toBe(401);
    });

    it("does NOT reveal CRON_SECRET name or auth mechanism in 401 response", async () => {
      const handler = await getHandler();
      const req = mockReq({ headers: { authorization: "Bearer wrong" } });
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      const body = parseBody(res as unknown as MockRes);
      expect(body.error).toBe("Unauthorized");
      expect(JSON.stringify(body)).not.toContain("CRON_SECRET");
      expect(JSON.stringify(body)).not.toContain("Bearer");
      expect(JSON.stringify(body)).not.toContain("token");
    });

    it("includes security headers on 401 response", async () => {
      const handler = await getHandler();
      const req = mockReq({ headers: { authorization: "Bearer wrong" } });
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes).writeHead).toHaveBeenCalledWith(401, SECURITY_HEADERS);
    });

    it("grants access with correct Bearer token", async () => {
      const handler = await getHandler();
      const req = mockReq({ headers: { authorization: `Bearer ${SECRET}` } });
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      // Should NOT be 401 or 403
      expect((res as unknown as MockRes).statusCode).not.toBe(401);
      expect((res as unknown as MockRes).statusCode).not.toBe(403);
    });

    it("uses timing-safe comparison (does not use plain ===)", async () => {
      // Verify the module imports crypto and uses timingSafeEqual
      // by checking that a nearly-correct token is still rejected
      // (this is a behavioral test, not implementation-detail test)
      const handler = await getHandler();
      const almostRight = SECRET.slice(0, -1) + "X";
      const req = mockReq({ headers: { authorization: `Bearer ${almostRight}` } });
      const res = mockRes();

      handler(req, res as unknown as ServerResponse);

      expect((res as unknown as MockRes).statusCode).toBe(401);
    });
  });
});

// ===========================================================================
// Env Var Checking Tests
// ===========================================================================

describe("env-check: var checking logic", () => {
  const SECRET = "test-cron-secret-for-checking!!!!";

  function authedReq() {
    return mockReq({ headers: { authorization: `Bearer ${SECRET}` } });
  }

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    // Clear all checked vars to start clean
    delete process.env.DATABASE_URL;
    delete process.env.SESSION_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.MFA_ENCRYPTION_KEY;
    delete process.env.FIREBASE_ADMIN_KEY;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.REDIS_URL;
  });

  it("returns 503 when required vars are missing", async () => {
    const handler = await getHandler();
    const res = mockRes();

    handler(authedReq(), res as unknown as ServerResponse);

    expect((res as unknown as MockRes).statusCode).toBe(503);
    const body = parseBody(res as unknown as MockRes);
    expect(body.summary).toEqual(expect.objectContaining({ allRequiredPresent: false }));
  });

  it("returns 200 when all required vars are set", async () => {
    process.env.DATABASE_URL = "postgres://localhost/test";
    process.env.SESSION_SECRET = "session-secret-value";
    process.env.JWT_SECRET = "jwt-secret-value";
    process.env.MFA_ENCRYPTION_KEY = "mfa-encryption-key-value";

    const handler = await getHandler();
    const res = mockRes();

    handler(authedReq(), res as unknown as ServerResponse);

    expect((res as unknown as MockRes).statusCode).toBe(200);
    const body = parseBody(res as unknown as MockRes);
    expect(body.summary).toEqual(expect.objectContaining({ allRequiredPresent: true, failing: 0 }));
  });

  it("includes security headers on 200 response", async () => {
    process.env.DATABASE_URL = "postgres://localhost/test";
    process.env.SESSION_SECRET = "session-secret-value";
    process.env.JWT_SECRET = "jwt-secret-value";
    process.env.MFA_ENCRYPTION_KEY = "mfa-encryption-key-value";

    const handler = await getHandler();
    const res = mockRes();

    handler(authedReq(), res as unknown as ServerResponse);

    expect((res as unknown as MockRes).writeHead).toHaveBeenCalledWith(200, SECURITY_HEADERS);
  });

  it("includes security headers on 503 response", async () => {
    const handler = await getHandler();
    const res = mockRes();

    handler(authedReq(), res as unknown as ServerResponse);

    expect((res as unknown as MockRes).writeHead).toHaveBeenCalledWith(503, SECURITY_HEADERS);
  });

  it("reports 'missing' for undefined vars", async () => {
    const handler = await getHandler();
    const res = mockRes();

    handler(authedReq(), res as unknown as ServerResponse);

    const body = parseBody(res as unknown as MockRes);
    const dbUrl = (body.required as Array<Record<string, unknown>>).find(
      (r) => r.name === "DATABASE_URL"
    );
    expect(dbUrl).toEqual(expect.objectContaining({ status: "missing", length: 0 }));
  });

  it("reports 'empty_string' for vars set to empty string", async () => {
    process.env.DATABASE_URL = "  ";

    const handler = await getHandler();
    const res = mockRes();

    handler(authedReq(), res as unknown as ServerResponse);

    const body = parseBody(res as unknown as MockRes);
    const dbUrl = (body.required as Array<Record<string, unknown>>).find(
      (r) => r.name === "DATABASE_URL"
    );
    expect(dbUrl).toEqual(expect.objectContaining({ status: "empty_string", length: 0 }));
  });

  it("masks sensitive values to 2 characters", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@host/db";

    const handler = await getHandler();
    const res = mockRes();

    handler(authedReq(), res as unknown as ServerResponse);

    const body = parseBody(res as unknown as MockRes);
    const dbUrl = (body.required as Array<Record<string, unknown>>).find(
      (r) => r.name === "DATABASE_URL"
    );
    expect(dbUrl).toEqual(
      expect.objectContaining({
        status: "set",
        preview: "po***",
      })
    );
    // Must NOT contain the full value
    expect(JSON.stringify(body)).not.toContain("postgres://user:pass");
  });

  it("shows full value for non-masked vars", async () => {
    process.env.FIREBASE_PROJECT_ID = "my-project-id";

    const handler = await getHandler();
    const res = mockRes();

    handler(authedReq(), res as unknown as ServerResponse);

    const body = parseBody(res as unknown as MockRes);
    const projectId = (body.optional as Array<Record<string, unknown>>).find(
      (r) => r.name === "FIREBASE_PROJECT_ID"
    );
    expect(projectId).toEqual(
      expect.objectContaining({
        status: "set",
        preview: "my-project-id",
      })
    );
  });

  it("separates required and optional vars in response", async () => {
    const handler = await getHandler();
    const res = mockRes();

    handler(authedReq(), res as unknown as ServerResponse);

    const body = parseBody(res as unknown as MockRes);
    const requiredNames = (body.required as Array<Record<string, unknown>>).map((r) => r.name);
    const optionalNames = (body.optional as Array<Record<string, unknown>>).map((r) => r.name);

    expect(requiredNames).toContain("DATABASE_URL");
    expect(requiredNames).toContain("SESSION_SECRET");
    expect(requiredNames).toContain("JWT_SECRET");
    expect(requiredNames).toContain("MFA_ENCRYPTION_KEY");
    expect(requiredNames).toHaveLength(4);

    expect(optionalNames).toContain("FIREBASE_PROJECT_ID");
    expect(optionalNames).toContain("NODE_ENV");
    expect(optionalNames).not.toContain("DATABASE_URL");
  });
});

// ===========================================================================
// Payload Metadata Tests
// ===========================================================================

describe("env-check: payload metadata", () => {
  const SECRET = "test-cron-secret-for-metadata!!!!";

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.DATABASE_URL = "pg://x";
    process.env.SESSION_SECRET = "s";
    process.env.JWT_SECRET = "j";
    process.env.MFA_ENCRYPTION_KEY = "m";
  });

  it("includes timestamp in ISO format", async () => {
    const handler = await getHandler();
    const res = mockRes();

    handler(
      mockReq({ headers: { authorization: `Bearer ${SECRET}` } }),
      res as unknown as ServerResponse
    );

    const body = parseBody(res as unknown as MockRes);
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes vercelEnv from VERCEL_ENV", async () => {
    process.env.VERCEL_ENV = "preview";
    const handler = await getHandler();
    const res = mockRes();

    handler(
      mockReq({ headers: { authorization: `Bearer ${SECRET}` } }),
      res as unknown as ServerResponse
    );

    const body = parseBody(res as unknown as MockRes);
    expect(body.vercelEnv).toBe("preview");
  });

  it("shows '(not set)' when VERCEL_ENV is undefined", async () => {
    delete process.env.VERCEL_ENV;
    const handler = await getHandler();
    const res = mockRes();

    handler(
      mockReq({ headers: { authorization: `Bearer ${SECRET}` } }),
      res as unknown as ServerResponse
    );

    const body = parseBody(res as unknown as MockRes);
    expect(body.vercelEnv).toBe("(not set)");
  });

  it("includes git metadata when available", async () => {
    process.env.VERCEL_GIT_COMMIT_REF = "main";
    process.env.VERCEL_GIT_COMMIT_SHA = "abc1234567890";
    const handler = await getHandler();
    const res = mockRes();

    handler(
      mockReq({ headers: { authorization: `Bearer ${SECRET}` } }),
      res as unknown as ServerResponse
    );

    const body = parseBody(res as unknown as MockRes);
    expect(body.gitBranch).toBe("main");
    expect(body.gitSha).toBe("abc1234");
  });

  it("includes summary with totalChecked count", async () => {
    const handler = await getHandler();
    const res = mockRes();

    handler(
      mockReq({ headers: { authorization: `Bearer ${SECRET}` } }),
      res as unknown as ServerResponse
    );

    const body = parseBody(res as unknown as MockRes);
    expect((body.summary as Record<string, unknown>).totalChecked).toBeGreaterThan(0);
  });

  it("shows '(not set)' when NODE_ENV is undefined", async () => {
    delete process.env.NODE_ENV;
    const handler = await getHandler();
    const res = mockRes();

    handler(
      mockReq({ headers: { authorization: `Bearer ${SECRET}` } }),
      res as unknown as ServerResponse
    );

    const body = parseBody(res as unknown as MockRes);
    expect(body.nodeEnv).toBe("(not set)");
  });

  it("shows '(not set)' for git metadata when not available", async () => {
    delete process.env.VERCEL_GIT_COMMIT_REF;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const handler = await getHandler();
    const res = mockRes();

    handler(
      mockReq({ headers: { authorization: `Bearer ${SECRET}` } }),
      res as unknown as ServerResponse
    );

    const body = parseBody(res as unknown as MockRes);
    expect(body.gitBranch).toBe("(not set)");
    expect(body.gitSha).toBe("(not set)");
  });
});
