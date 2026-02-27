/**
 * Coverage test for server/auth/audit.ts — uncovered line 173
 *
 * Line 173: The catch block when writing to database fails:
 *   logger.error("Failed to write audit log to database", {
 *     error: dbError instanceof Error ? dbError.message : "Unknown error",
 *     originalEntry: entry,
 *   });
 *
 * To trigger this, we need:
 * 1. getDb() returns a db instance
 * 2. getDb().execute() throws an error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/env", () => ({
  env: { NODE_ENV: "test" },
}));

const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();
const mockLoggerDebug = vi.fn();

vi.mock("../../logger", () => ({
  default: {
    info: (...args: any[]) => mockLoggerInfo(...args),
    warn: (...args: any[]) => mockLoggerWarn(...args),
    error: (...args: any[]) => mockLoggerError(...args),
    debug: (...args: any[]) => mockLoggerDebug(...args),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../db", () => ({
  getDb: () => ({
    execute: vi.fn().mockRejectedValue(new Error("Database write failed")),
  }),
}));

vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({
    _sql: strings.join("?"),
    values,
  }),
}));

const { AuditLogger, AUDIT_EVENTS } = await import("../../auth/audit");

describe("AuditLogger — line 173 (DB write failure)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs error when database audit write fails", async () => {
    await AuditLogger.log({
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      userId: "u1",
      email: "test@example.com",
      ipAddress: "127.0.0.1",
      success: true,
    });

    // Should have logged the audit event via logger.info (success)
    expect(mockLoggerInfo).toHaveBeenCalledWith("AUDIT: AUTH_LOGIN_SUCCESS", expect.any(Object));

    // Should have logged the DB error
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to write audit log to database",
      expect.objectContaining({
        error: "Database write failed",
        originalEntry: expect.objectContaining({
          eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
        }),
      })
    );
  });

  it("logs error with 'Unknown error' for non-Error exceptions", async () => {
    // Override the mock to throw a non-Error
    vi.resetModules();

    vi.doMock("../../db", () => ({
      getDb: () => ({
        execute: vi.fn().mockRejectedValue("string error"),
      }),
    }));

    vi.doMock("../../logger", () => ({
      default: {
        info: mockLoggerInfo,
        warn: mockLoggerWarn,
        error: mockLoggerError,
        debug: mockLoggerDebug,
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("drizzle-orm", () => ({
      sql: (strings: TemplateStringsArray, ...values: any[]) => ({
        _sql: strings.join("?"),
        values,
      }),
    }));

    const { AuditLogger: AL, AUDIT_EVENTS: AE } = await import("../../auth/audit");

    vi.clearAllMocks();

    await AL.log({
      eventType: AE.LOGIN_FAILURE,
      email: "test@example.com",
      ipAddress: "10.0.0.1",
      success: false,
      errorMessage: "Invalid credentials",
    });

    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to write audit log to database",
      expect.objectContaining({
        error: "Unknown error",
      })
    );
  });
});
