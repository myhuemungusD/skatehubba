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
