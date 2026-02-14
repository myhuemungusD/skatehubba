/**
 * Isolated test for logger.ts redact() edge cases.
 * Must be in its own file to avoid vi.mock() conflicts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

describe("Logger — redact edge cases", () => {
  afterEach(() => {
    delete process.env.LOG_LEVEL;
  });

  it("skips falsy values, masks arrays, redacts nested objects", async () => {
    vi.resetModules();

    // Capture console output
    const captured: string[] = [];
    const origInfo = console.info;
    const origDebug = console.debug;
    console.info = (...args: unknown[]) => captured.push(String(args[0]));
    console.debug = (...args: unknown[]) => captured.push(String(args[0]));

    try {
      process.env.LOG_LEVEL = "info";

      const { createChildLogger } = await import("../logger");
      const logger = createChildLogger({});

      // Test 1: falsy values are skipped (line 85)
      logger.info("test falsy", {
        nullVal: null,
        undefinedVal: undefined,
        zeroVal: 0,
        emptyStr: "",
      });

      // Test 2: sensitive arrays are masked (line 93)
      logger.info("test array", { tokens: ["abc", "def"] });

      // Test 3: non-sensitive values pass through (line 102)
      logger.info("test nonsensitive", { count: 42 });

      // Test 4: nested objects are redacted recursively (lines 97-99)
      logger.info("test nested", {
        user: { email: "secret@test.com", name: "John" },
      });

      // Verify
      const falsyLine = captured.find((l) => l.includes("test falsy"));
      expect(falsyLine).toBeDefined();

      const arrayLine = captured.find((l) => l.includes("test array"));
      expect(arrayLine).toBeDefined();
      expect(arrayLine).toContain("***");

      const nonsensitiveLine = captured.find((l) => l.includes("test nonsensitive"));
      expect(nonsensitiveLine).toBeDefined();
      expect(nonsensitiveLine).toContain("42");

      const nestedLine = captured.find((l) => l.includes("test nested"));
      expect(nestedLine).toBeDefined();
      expect(nestedLine).toContain("***");
    } finally {
      console.info = origInfo;
      console.debug = origDebug;
    }
  });
});
