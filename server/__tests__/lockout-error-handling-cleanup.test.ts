/**
 * Coverage tests for server/auth/lockout.ts — uncovered lines 89, 183-227
 *
 * Line 89: checkLockout catch block — error logged, fails closed
 *   (already covered in lockout.test.ts, but line 89 specifically references
 *    the error message extraction: `error instanceof Error ? error.message : "Unknown error"`)
 *
 * Lines 183-227: recordAttempt catch block (183-187),
 *   unlockAccount (195-204), cleanup (210-227)
 *
 * The existing lockout.test.ts covers getLockoutMessage, checkLockout, recordAttempt (success),
 * and unlockAccount. We need to cover:
 * - recordAttempt error path (lines 182-187)
 * - cleanup() method (lines 210-227)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSelect,
  mockInsert,
  mockDelete,
  mockFrom,
  mockWhere,
  mockValues,
  mockOnConflictDoUpdate,
  mockExecute,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockValues: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
    execute: mockExecute,
  }),
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../auth/audit", () => ({
  AuditLogger: {
    logAccountLocked: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../security", () => ({
  SECURITY_CONFIG: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000,
  },
}));

vi.mock("../../packages/shared/schema/index", () => ({
  loginAttempts: { email: "email", success: "success", createdAt: "createdAt" },
  accountLockouts: { email: "email", unlockAt: "unlockAt", failedAttempts: "failedAttempts" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gt: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((strings: TemplateStringsArray, ...vals: any[]) => ({
    _sql: true,
    strings,
    vals,
  })),
  count: vi.fn(() => "count"),
}));

vi.mock("../config/constants", () => ({
  LOGIN_ATTEMPT_WINDOW_MS: 60 * 60 * 1000,
}));

const { LockoutService } = await import("../auth/lockout");
const logger = (await import("../logger")).default;

describe("LockoutService — additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockInsert.mockReturnValue({ values: mockValues });
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockWhere.mockResolvedValue([]);
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockDelete.mockReturnValue({ where: mockWhere });
    mockExecute.mockResolvedValue(undefined);
  });

  /**
   * Line 89: checkLockout catch with non-Error thrown
   */
  it("checkLockout logs 'Unknown error' for non-Error exceptions (line 89)", async () => {
    mockWhere.mockRejectedValue("string-error");

    const status = await LockoutService.checkLockout("test@example.com");

    expect(status.isLocked).toBe(true);
    expect(status.failedAttempts).toBe(5);
    expect(status.unlockAt).toBeInstanceOf(Date);
    expect(logger.error).toHaveBeenCalledWith(
      "Error checking lockout status",
      expect.objectContaining({ error: "Unknown error" })
    );
  });

  /**
   * Lines 182-187: recordAttempt catch block
   * When insert throws, it should log error and fall through to checkLockout
   */
  it("recordAttempt handles error and falls through to checkLockout (lines 182-187)", async () => {
    // Make insert().values() throw
    mockValues.mockRejectedValue(new Error("Insert failed"));

    // checkLockout should still work (called as fallback)
    // Need to set up mockSelect/mockFrom/mockWhere for the fallback
    let callCount = 0;
    mockWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([]); // no lockout
      return Promise.resolve([{ count: 0 }]); // 0 failed attempts
    });

    const status = await LockoutService.recordAttempt("test@example.com", "1.2.3.4", false);

    expect(logger.error).toHaveBeenCalledWith(
      "Error recording login attempt",
      expect.objectContaining({ error: "Insert failed" })
    );
    expect(status.isLocked).toBe(false);
  });

  /**
   * Lines 195-204: unlockAccount — already tested but ensuring the full path
   */
  it("unlockAccount deletes lockout and logs info", async () => {
    mockWhere.mockResolvedValue(undefined);

    await LockoutService.unlockAccount("  UPPER@Example.com  ");

    expect(mockDelete).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Account unlocked manually",
      expect.objectContaining({ email: "upper@example.com" })
    );
  });

  /**
   * Lines 210-227: cleanup() method
   */
  it("cleanup deletes expired lockouts and old attempt records", async () => {
    mockExecute.mockResolvedValue(undefined);
    // delete().where() for two separate calls
    mockWhere.mockResolvedValue(undefined);

    await LockoutService.cleanup();

    // Should have called delete twice (once for lockouts, once for attempts)
    // via execute for sql template literals
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith("Cleaned up expired lockouts and old login attempts");
  });

  it("cleanup handles errors gracefully", async () => {
    mockWhere.mockRejectedValue(new Error("Cleanup DB error"));

    await LockoutService.cleanup();

    expect(logger.error).toHaveBeenCalledWith(
      "Error cleaning up lockout data",
      expect.objectContaining({ error: "Cleanup DB error" })
    );
  });
});
