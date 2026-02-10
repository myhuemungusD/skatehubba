/**
 * Tests for client/src/lib/logger.ts
 *
 * Covers the logger singleton (dev vs prod behaviour),
 * logError, and logPerformance helpers.
 *
 * Because `isDevelopment` is captured once at module load time we use
 * vi.resetModules() + dynamic import to test both branches.
 *
 * NOTE: In Vitest, import.meta.env.DEV defaults to `true`. We must
 * explicitly override it to test the production branch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  let consoleSpy: Record<string, ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    vi.resetModules();
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Development mode (import.meta.env.DEV === true, the DEFAULT in Vitest)
  // ────────────────────────────────────────────────────────────────────────

  describe("development mode (DEV = true, default)", () => {
    it("exports a logger with all five methods", async () => {
      const { logger } = await import("../logger");

      expect(logger.log).toBeTypeOf("function");
      expect(logger.info).toBeTypeOf("function");
      expect(logger.warn).toBeTypeOf("function");
      expect(logger.error).toBeTypeOf("function");
      expect(logger.debug).toBeTypeOf("function");
    });

    it("logger.log forwards to console.log", async () => {
      const { logger } = await import("../logger");

      logger.log("dev log");
      expect(consoleSpy.log).toHaveBeenCalledWith("dev log");
    });

    it("logger.info forwards to console.info", async () => {
      const { logger } = await import("../logger");

      logger.info("dev info");
      expect(consoleSpy.info).toHaveBeenCalledWith("dev info");
    });

    it("logger.warn forwards to console.warn", async () => {
      const { logger } = await import("../logger");

      logger.warn("dev warn");
      expect(consoleSpy.warn).toHaveBeenCalledWith("dev warn");
    });

    it("logger.error forwards to console.error", async () => {
      const { logger } = await import("../logger");

      logger.error("dev error");
      expect(consoleSpy.error).toHaveBeenCalledWith("dev error");
    });

    it("logger.debug forwards to console.debug", async () => {
      const { logger } = await import("../logger");

      logger.debug("dev debug");
      expect(consoleSpy.debug).toHaveBeenCalledWith("dev debug");
    });

    it("logger.log forwards multiple arguments", async () => {
      const { logger } = await import("../logger");

      logger.log("message", { data: 42 }, "extra");
      expect(consoleSpy.log).toHaveBeenCalledWith("message", { data: 42 }, "extra");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Production mode (import.meta.env.DEV === false)
  // ────────────────────────────────────────────────────────────────────────

  describe("production mode (DEV = false)", () => {
    it("logger.error still forwards to console.error", async () => {
      import.meta.env.DEV = false;
      const { logger } = await import("../logger");
      import.meta.env.DEV = true; // restore for other tests

      logger.error("production error", 42);
      expect(consoleSpy.error).toHaveBeenCalledWith("production error", 42);
    });

    it("logger.log is a no-op in production", async () => {
      import.meta.env.DEV = false;
      const { logger } = await import("../logger");
      import.meta.env.DEV = true;

      logger.log("should be silenced");
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it("logger.info is a no-op in production", async () => {
      import.meta.env.DEV = false;
      const { logger } = await import("../logger");
      import.meta.env.DEV = true;

      logger.info("info message");
      expect(consoleSpy.info).not.toHaveBeenCalled();
    });

    it("logger.warn is a no-op in production", async () => {
      import.meta.env.DEV = false;
      const { logger } = await import("../logger");
      import.meta.env.DEV = true;

      logger.warn("warning message");
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it("logger.debug is a no-op in production", async () => {
      import.meta.env.DEV = false;
      const { logger } = await import("../logger");
      import.meta.env.DEV = true;

      logger.debug("debug message");
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // logError
  // ────────────────────────────────────────────────────────────────────────

  describe("logError", () => {
    it("logs error message and stack via logger.error", async () => {
      const { logError, logger } = await import("../logger");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      const error = new Error("Test error");
      logError(error);

      expect(errorSpy).toHaveBeenCalledWith(
        "[SkateHubba Error]",
        expect.objectContaining({
          message: "Test error",
          stack: expect.any(String),
        })
      );
      errorSpy.mockRestore();
    });

    it("merges optional context into the logged object", async () => {
      const { logError, logger } = await import("../logger");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      const error = new Error("Firestore timeout");
      logError(error, { userId: "user-42", action: "checkIn" });

      expect(errorSpy).toHaveBeenCalledWith(
        "[SkateHubba Error]",
        expect.objectContaining({
          message: "Firestore timeout",
          userId: "user-42",
          action: "checkIn",
        })
      );
      errorSpy.mockRestore();
    });

    it("works without context", async () => {
      const { logError, logger } = await import("../logger");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      logError(new Error("bare"));

      expect(errorSpy).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // logPerformance
  // ────────────────────────────────────────────────────────────────────────

  describe("logPerformance", () => {
    it("logs with default unit 'ms'", async () => {
      const { logPerformance, logger } = await import("../logger");
      const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});

      logPerformance("pageLoad", 1234);

      expect(logSpy).toHaveBeenCalledWith("[Performance] pageLoad: 1234ms");
      logSpy.mockRestore();
    });

    it("logs with a custom unit", async () => {
      const { logPerformance, logger } = await import("../logger");
      const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});

      logPerformance("memoryUsage", 256, "MB");

      expect(logSpy).toHaveBeenCalledWith("[Performance] memoryUsage: 256MB");
      logSpy.mockRestore();
    });

    it("handles zero value", async () => {
      const { logPerformance, logger } = await import("../logger");
      const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});

      logPerformance("latency", 0);

      expect(logSpy).toHaveBeenCalledWith("[Performance] latency: 0ms");
      logSpy.mockRestore();
    });

    it("handles negative value (edge case)", async () => {
      const { logPerformance, logger } = await import("../logger");
      const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});

      logPerformance("drift", -5, "s");

      expect(logSpy).toHaveBeenCalledWith("[Performance] drift: -5s");
      logSpy.mockRestore();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // LogLevel type / logger shape
  // ────────────────────────────────────────────────────────────────────────

  describe("LogLevel type (compile-time check)", () => {
    it("logger exports all five standard methods", async () => {
      const { logger } = await import("../logger");
      const levels = ["log", "info", "warn", "error", "debug"] as const;
      for (const level of levels) {
        expect(logger[level]).toBeTypeOf("function");
      }
    });
  });
});
