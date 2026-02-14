/**
 * Coverage test for server/logger.ts — uncovered line 78
 *
 * Line 78: The default case in the switch statement — `console.log(line)`
 * This is reached when the log level is not one of the known levels.
 * Since the type system constrains LogLevel, we need to force the
 * private `log` method to receive an unknown level.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Logger — default switch case (line 78)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls through to console.log for unknown log level", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";

    const mod = await import("../logger");
    const logger = mod.default;

    // Access the private `log` method via bracket notation to bypass TypeScript.
    // Pass an unknown level string like "trace" that doesn't match any switch case.
    (logger as any).log("trace" as any, "Trace message", {});

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("[TRACE] Trace message"));
  });
});
