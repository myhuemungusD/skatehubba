import { describe, it, expect, vi } from "vitest";
import { validateHoneypot, validateEmail, validateUserAgent, logIPAddress } from "./security";

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

  it("allows missing user agent", () => {
    const { req, res, next, statusFn } = createMockReqRes();
    validateUserAgent(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(statusFn).not.toHaveBeenCalled();
  });

  it("allows legitimate tools and bots", () => {
    const allowedAgents = [
      "Googlebot/2.1",
      "my-crawler",
      "web-spider",
      "curl/7.68",
      "Wget/1.21",
      "python-requests/2.28",
    ];
    for (const ua of allowedAgents) {
      const { req, res, next } = createMockReqRes({ headers: { "user-agent": ua } });
      validateUserAgent(req, res, next);
      expect(next).toHaveBeenCalled();
    }
  });

  it("rejects malicious user agents", () => {
    const maliciousAgents = ["scraper-tool", "nikto/2.1", "sqlmap/1.0", "masscan/1.0"];
    for (const ua of maliciousAgents) {
      const { req, res, next, statusFn, jsonFn } = createMockReqRes({
        headers: { "user-agent": ua },
      });
      validateUserAgent(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "Automated requests not allowed",
      });
    }
  });
});

describe("logIPAddress", () => {
  it("uses req.ip (respects trust proxy)", () => {
    const { req, res, next } = createMockReqRes({});
    req.ip = "203.0.113.50";
    logIPAddress(req, res, next);
    expect(req.clientIpAddress).toBe("203.0.113.50");
    expect(next).toHaveBeenCalled();
  });

  it("falls back to default when req.ip not set", () => {
    const { req, res, next } = createMockReqRes({});
    logIPAddress(req, res, next);
    // req.ip is undefined in this mock, so clientIpAddress is undefined
    expect(req.clientIpAddress).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it("always calls next()", () => {
    const { req, res, next } = createMockReqRes({});
    req.ip = "10.0.0.1";
    logIPAddress(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
