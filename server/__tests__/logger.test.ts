/**
 * @fileoverview Unit tests for Logger module
 * @module server/__tests__/logger.test
 *
 * Tests:
 * - Log levels (debug, info, warn, error, fatal)
 * - Log level filtering
 * - Context serialization
 * - Sensitive data redaction
 * - Child logger creation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Logger", () => {
  let originalEnv: string | undefined;
  let originalLogLevel: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalLogLevel = process.env.LOG_LEVEL;
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
    vi.restoreAllMocks();
  });

  it("should export a default logger and createChildLogger", async () => {
    // Re-import each test to get a fresh module
    vi.resetModules();
    process.env.NODE_ENV = "test";
    const mod = await import("../logger");
    expect(mod.default).toBeDefined();
    expect(typeof mod.createChildLogger).toBe("function");
  });

  it("should log info messages", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.info("Test info message");

    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("[INFO] Test info message"));
  });

  it("should log warn messages", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.warn("Test warning");

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[WARN] Test warning"));
  });

  it("should log error messages", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.error("Test error");

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[ERROR] Test error"));
  });

  it("should log fatal messages", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.fatal("Test fatal");

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[FATAL] Test fatal"));
  });

  it("should log debug messages when level allows", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.debug("Debug message");

    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining("[DEBUG] Debug message"));
  });

  it("should filter messages below minimum level", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "error";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.debug("Should not appear");
    logger.info("Should not appear either");
    logger.warn("Should not appear either");

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("should redact sensitive fields (password, token, secret, email)", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.info("User login", {
      password: "secret123",
      token: "abc.xyz.123",
      email: "test@example.com",
      userId: "user-1",
    });

    const logOutput = (console.info as any).mock.calls[0][0];
    expect(logOutput).toContain("***");
    expect(logOutput).not.toContain("secret123");
    expect(logOutput).not.toContain("abc.xyz.123");
    expect(logOutput).not.toContain("test@example.com");
    expect(logOutput).toContain("user-1");
  });

  it("should include context in log output", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.info("Something happened", { requestId: "req-123", action: "test" });

    const logOutput = (console.info as any).mock.calls[0][0];
    expect(logOutput).toContain("req-123");
  });

  it("should create child loggers with merged bindings", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");

    const child = mod.createChildLogger({ module: "auth" });
    child.info("Child logger test");

    const logOutput = (console.info as any).mock.calls[0][0];
    expect(logOutput).toContain("auth");
  });

  it("should handle empty context", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.info("No context");

    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("[INFO] No context"));
  });

  it("should handle nested objects in context", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.info("Nested", {
      user: { id: "u-1", name: "Test" },
    });

    const logOutput = (console.info as any).mock.calls[0][0];
    expect(logOutput).toContain("u-1");
  });

  it("should handle arrays in context", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.info("Array context", {
      items: ["a", "b", "c"],
    });

    const logOutput = (console.info as any).mock.calls[0][0];
    expect(logOutput).toContain("[INFO] Array context");
  });

  it("should redact sensitive keys in arrays", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.info("Tokens", {
      tokens: ["token-a", "token-b"],
    });

    const logOutput = (console.info as any).mock.calls[0][0];
    expect(logOutput).toContain("***");
  });

  it("should use info as default level in production", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    delete process.env.LOG_LEVEL;
    const mod = await import("../logger");
    const logger = mod.default;

    logger.debug("Should not appear in production");
    expect(console.debug).not.toHaveBeenCalled();

    logger.info("Should appear");
    expect(console.info).toHaveBeenCalled();
  });

  it("should skip null/undefined values in redaction", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    const mod = await import("../logger");
    const logger = mod.default;

    logger.info("Nulls", {
      value: null,
      other: undefined,
      valid: "yes",
    });

    const logOutput = (console.info as any).mock.calls[0][0];
    expect(logOutput).toContain("yes");
  });
});
