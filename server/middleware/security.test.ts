import { describe, it, expect, vi } from "vitest";
import {
  securityMiddleware,
  validateHoneypot,
  validateEmail,
  validateUserAgent,
  logIPAddress,
} from "./security";

function createMockReqRes(
  overrides: {
    body?: Record<string, any>;
    headers?: Record<string, string>;
    connection?: any;
    socket?: any;
  } = {}
) {
  const headers = overrides.headers ?? {};
  const req = {
    body: overrides.body ?? {},
    get: (name: string) => headers[name.toLowerCase()] ?? headers[name],
    headers,
    connection: overrides.connection ?? { remoteAddress: "127.0.0.1" },
    socket: overrides.socket ?? { remoteAddress: "127.0.0.1" },
  } as any;

  const jsonFn = vi.fn().mockReturnThis();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const res = { status: statusFn, json: jsonFn } as any;
  const next = vi.fn();
  return { req, res, next, statusFn, jsonFn };
}

describe("securityMiddleware", () => {
  it("passes through for all requests", () => {
    const { req, res, next } = createMockReqRes();
    securityMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("validateHoneypot", () => {
  it("allows requests without honeypot field", () => {
    const { req, res, next } = createMockReqRes({ body: {} });
    validateHoneypot(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows requests with empty honeypot field", () => {
    const { req, res, next } = createMockReqRes({ body: { company: "" } });
    validateHoneypot(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows requests with whitespace-only honeypot", () => {
    const { req, res, next } = createMockReqRes({ body: { company: "   " } });
    validateHoneypot(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects requests with filled honeypot", () => {
    const { req, res, next, statusFn } = createMockReqRes({ body: { company: "ACME Corp" } });
    validateHoneypot(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(400);
  });
});

describe("validateEmail", () => {
  it("allows valid email", () => {
    const { req, res, next } = createMockReqRes({ body: { email: "test@example.com" } });
    validateEmail(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body.email).toBe("test@example.com");
  });

  it("normalizes email to lowercase", () => {
    const { req, res, next } = createMockReqRes({ body: { email: "Test@Example.COM" } });
    validateEmail(req, res, next);
    expect(req.body.email).toBe("test@example.com");
  });

  it("trims whitespace", () => {
    const { req, res, next } = createMockReqRes({ body: { email: "  test@example.com  " } });
    validateEmail(req, res, next);
    expect(req.body.email).toBe("test@example.com");
  });

  it("rejects missing email", () => {
    const { req, res, next, statusFn } = createMockReqRes({ body: {} });
    validateEmail(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it("rejects non-string email", () => {
    const { req, res, next, statusFn } = createMockReqRes({ body: { email: 123 } });
    validateEmail(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it("rejects invalid email format", () => {
    const { req, res, next, statusFn } = createMockReqRes({ body: { email: "not-an-email" } });
    validateEmail(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it("rejects email without domain dot", () => {
    const { req, res, next, statusFn } = createMockReqRes({ body: { email: "test@localhost" } });
    validateEmail(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it("rejects email with double dots in local part", () => {
    const { req, res, next, statusFn } = createMockReqRes({
      body: { email: "test..user@example.com" },
    });
    validateEmail(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it("rejects email starting with dot in local part", () => {
    const { req, res, next, statusFn } = createMockReqRes({ body: { email: ".test@example.com" } });
    validateEmail(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it("accepts email with plus addressing", () => {
    const { req, res, next } = createMockReqRes({ body: { email: "test+tag@example.com" } });
    validateEmail(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("validateUserAgent", () => {
  it("allows normal browser user agent", () => {
    const { req, res, next } = createMockReqRes({
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0" },
    });
    validateUserAgent(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects missing user agent", () => {
    const { req, res, next, statusFn } = createMockReqRes();
    validateUserAgent(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it("rejects bot user agents", () => {
    const botAgents = [
      "Googlebot/2.1",
      "my-crawler",
      "web-spider",
      "scraper-tool",
      "curl/7.68",
      "Wget/1.21",
      "python-requests/2.28",
    ];
    for (const ua of botAgents) {
      const { req, res, next, statusFn } = createMockReqRes({ headers: { "user-agent": ua } });
      validateUserAgent(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(statusFn).toHaveBeenCalledWith(400);
    }
  });
});

describe("logIPAddress", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const { req, res, next } = createMockReqRes({
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    logIPAddress(req, res, next);
    expect(req.body.ipAddress).toBe("1.2.3.4");
    expect(next).toHaveBeenCalled();
  });

  it("extracts IP from x-real-ip header", () => {
    const { req, res, next } = createMockReqRes({
      headers: { "x-real-ip": "5.6.7.8" },
    });
    logIPAddress(req, res, next);
    expect(req.body.ipAddress).toBe("5.6.7.8");
    expect(next).toHaveBeenCalled();
  });

  it("falls back to connection.remoteAddress", () => {
    const { req, res, next } = createMockReqRes({
      connection: { remoteAddress: "10.0.0.1" },
    });
    logIPAddress(req, res, next);
    expect(req.body.ipAddress).toBe("10.0.0.1");
    expect(next).toHaveBeenCalled();
  });

  it("takes first entry from array x-forwarded-for", () => {
    const { req, res, next } = createMockReqRes({
      headers: { "x-forwarded-for": ["1.1.1.1", "2.2.2.2"] as any },
    });
    logIPAddress(req, res, next);
    expect(req.body.ipAddress).toBe("1.1.1.1");
    expect(next).toHaveBeenCalled();
  });
});
