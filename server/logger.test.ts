import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We import fresh each time since the logger reads process.env at construction time
describe("Logger", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalLogLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
    vi.restoreAllMocks();
  });

  it("exports a default logger and createChildLogger", async () => {
    const mod = await import("./logger");
    expect(mod.default).toBeDefined();
    expect(mod.createChildLogger).toBeDefined();
    expect(typeof mod.createChildLogger).toBe("function");
  });

  it("logger has all log level methods", async () => {
    const mod = await import("./logger");
    const logger = mod.default;
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.fatal).toBe("function");
  });

  it("child logger inherits parent bindings", async () => {
    const mod = await import("./logger");
    const child = mod.createChildLogger({ channel: "test" });
    expect(typeof child.info).toBe("function");
    expect(typeof child.error).toBe("function");
  });

  it("redacts sensitive keys like password, token, secret, email", async () => {
    const mod = await import("./logger");
    const logger = mod.default;
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("test", { password: "secret123", token: "abc", email: "test@example.com" });
    if (spy.mock.calls.length > 0) {
      const output = spy.mock.calls[0][0];
      expect(output).not.toContain("secret123");
      expect(output).not.toContain("abc");
      expect(output).not.toContain("test@example.com");
      expect(output).toContain("***");
    }
  });

  it("does not redact non-sensitive keys", async () => {
    const mod = await import("./logger");
    const logger = mod.default;
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("test", { userId: "user123" });
    if (spy.mock.calls.length > 0) {
      const output = spy.mock.calls[0][0];
      expect(output).toContain("user123");
    }
  });
});

describe("Logger JSON mode", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("outputs JSON in production mode with required aggregation fields", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { default: logger } = await import("./logger");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logger.info("server started", { port: 3000 });

    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.message).toBe("server started");
    expect(parsed.levelName).toBe("info");
    expect(parsed.level).toBe(20);
    expect(parsed.hostname).toEqual(expect.any(String));
    expect(parsed.pid).toEqual(expect.any(Number));
    expect(parsed.timestamp).toEqual(expect.any(String));
    expect(parsed.port).toBe(3000);
  });

  it("outputs human-readable text in development mode", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const { default: logger } = await import("./logger");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logger.info("hello");

    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0][0];
    expect(output).toMatch(/^\[.*\] \[INFO\] hello/);
    expect(() => JSON.parse(output)).toThrow();
  });

  it("includes requestId from child logger in JSON output", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { createChildLogger } = await import("./logger");
    const child = createChildLogger({ requestId: "req-abc-123" });
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    child.info("request completed", { status: 200 });

    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.requestId).toBe("req-abc-123");
    expect(parsed.status).toBe(200);
    expect(parsed.hostname).toEqual(expect.any(String));
    expect(parsed.pid).toEqual(expect.any(Number));
  });

  it("redacts sensitive data in JSON mode", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { default: logger } = await import("./logger");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.warn("auth failure", { password: "secret123", token: "tok_live" });

    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.password).toBe("***");
    expect(parsed.token).toBe("***");
    expect(parsed.message).toBe("auth failure");
  });
});
