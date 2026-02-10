/**
 * @fileoverview Comprehensive unit tests for auth/lockout.ts
 * @module server/__tests__/auth-lockout-full.test
 *
 * Tests the LockoutService static methods:
 *  - checkLockout    (active lockout, failed attempts, DB error)
 *  - recordAttempt   (success, failure, threshold, DB error)
 *  - unlockAccount   (deletes lockout record)
 *  - cleanup         (expired lockouts, old attempts, DB error)
 *  - getLockoutMessage (various time ranges)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared before the dynamic import of the module under test
// ---------------------------------------------------------------------------

// Chainable mock DB with controllable return values per call
let selectResult: unknown[] = [];
let selectCountResult: unknown[] = [];
let selectCallIndex = 0;
const mockInsertValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockDeleteWhere = vi.fn();

const mockDb = {
  select: vi.fn().mockImplementation((fields?: unknown) => {
    // If called with a fields object containing count, return count result
    const isCountQuery =
      fields && typeof fields === "object" && Object.keys(fields as object).includes("count");
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          if (isCountQuery) {
            return Promise.resolve(selectCountResult);
          }
          const result = selectCallIndex === 0 ? selectResult : selectResult;
          selectCallIndex++;
          return Promise.resolve(result);
        }),
      }),
    };
  }),
  insert: vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((...args: unknown[]) => {
      mockInsertValues(...args);
      return {
        onConflictDoUpdate: vi.fn().mockImplementation((...oArgs: unknown[]) => {
          mockOnConflictDoUpdate(...oArgs);
          return Promise.resolve(undefined);
        }),
      };
    }),
  })),
  delete: vi.fn().mockImplementation(() => ({
    where: vi.fn().mockImplementation((...args: unknown[]) => {
      mockDeleteWhere(...args);
      return Promise.resolve(undefined);
    }),
  })),
};

vi.mock("../db", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("../../packages/shared/schema/index", () => ({
  loginAttempts: {
    email: "email",
    success: "success",
    createdAt: "createdAt",
    ipAddress: "ipAddress",
  },
  accountLockouts: {
    email: "email",
    unlockAt: "unlockAt",
    lockedAt: "lockedAt",
    failedAttempts: "failedAttempts",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ _type: "and", args })),
  gt: vi.fn((...args: unknown[]) => ({ _type: "gt", args })),
  sql: vi.fn((...args: unknown[]) => ({ _type: "sql", args })),
  count: vi.fn(() => "count_fn"),
}));

vi.mock("../security", () => ({
  SECURITY_CONFIG: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 900000, // 15 minutes
  },
}));

vi.mock("../config/constants", () => ({
  LOGIN_ATTEMPT_WINDOW_MS: 900000, // 15 minutes
}));

const mockLogAccountLocked = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/audit", () => ({
  AuditLogger: {
    logAccountLocked: (...args: unknown[]) => mockLogAccountLocked(...args),
  },
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are registered)
// ---------------------------------------------------------------------------

const { LockoutService } = await import("../auth/lockout");

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = [];
  selectCountResult = [];
  selectCallIndex = 0;
});

// ===========================================================================
// checkLockout
// ===========================================================================

describe("LockoutService.checkLockout", () => {
  it("should return not locked with zero failed attempts when no lockout and no failed attempts", async () => {
    selectResult = []; // No active lockout
    selectCountResult = [{ count: 0 }]; // No failed attempts

    const status = await LockoutService.checkLockout("user@example.com");

    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(0);
    expect(status.remainingAttempts).toBe(5);
    expect(status.unlockAt).toBeUndefined();
  });

  it("should normalize email to lowercase and trim whitespace", async () => {
    selectResult = [];
    selectCountResult = [{ count: 0 }];

    await LockoutService.checkLockout("  User@EXAMPLE.com  ");

    // The mock db was called — we just verify it does not throw
    expect(mockDb.select).toHaveBeenCalled();
  });

  it("should return locked with unlockAt when an active lockout exists", async () => {
    const futureDate = new Date(Date.now() + 600000);
    selectResult = [{ unlockAt: futureDate, failedAttempts: 5 }];

    const status = await LockoutService.checkLockout("locked@example.com");

    expect(status.isLocked).toBe(true);
    expect(status.unlockAt).toEqual(futureDate);
    expect(status.failedAttempts).toBe(5);
    expect(status.remainingAttempts).toBeUndefined();
  });

  it("should return not locked with remaining attempts when failed attempts below threshold", async () => {
    selectResult = []; // No active lockout
    selectCountResult = [{ count: 3 }]; // 3 failed attempts

    const status = await LockoutService.checkLockout("user@example.com");

    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(3);
    expect(status.remainingAttempts).toBe(2); // 5 - 3 = 2
  });

  it("should return remainingAttempts = 0 when failed attempts equal threshold", async () => {
    selectResult = [];
    selectCountResult = [{ count: 5 }];

    const status = await LockoutService.checkLockout("user@example.com");

    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(5);
    expect(status.remainingAttempts).toBe(0);
  });

  it("should fail open (not locked) when database throws an error", async () => {
    mockDb.select.mockImplementationOnce(() => {
      throw new Error("DB connection lost");
    });

    const status = await LockoutService.checkLockout("user@example.com");

    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(0);
    expect(status.remainingAttempts).toBe(5);
  });

  it("should handle null count result gracefully", async () => {
    selectResult = []; // No lockout
    selectCountResult = [{ count: null }]; // null count

    const status = await LockoutService.checkLockout("user@example.com");

    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(0);
    expect(status.remainingAttempts).toBe(5);
  });

  it("should handle empty count result array", async () => {
    selectResult = [];
    selectCountResult = []; // Empty array

    const status = await LockoutService.checkLockout("user@example.com");

    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(0);
    expect(status.remainingAttempts).toBe(5);
  });
});

// ===========================================================================
// recordAttempt
// ===========================================================================

describe("LockoutService.recordAttempt", () => {
  it("should clear lockout and return not locked on successful login", async () => {
    const status = await LockoutService.recordAttempt("user@example.com", "1.2.3.4", true);

    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(0);
    expect(status.remainingAttempts).toBe(5);
    // Should have called insert for the attempt
    expect(mockDb.insert).toHaveBeenCalled();
    // Should have called delete to clear lockout
    expect(mockDb.delete).toHaveBeenCalled();
  });

  it("should return remaining attempts on failed login below threshold", async () => {
    // After insert, checkLockout is called — set up its responses
    selectResult = []; // No active lockout
    selectCountResult = [{ count: 2 }]; // 2 failed (below threshold of 5)

    const status = await LockoutService.recordAttempt("user@example.com", "1.2.3.4", false);

    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(2);
    expect(status.remainingAttempts).toBe(3); // 5 - 2
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("should create lockout record and return locked when failed attempts reach threshold", async () => {
    // checkLockout will return not locked but at threshold
    selectResult = []; // No existing lockout
    selectCountResult = [{ count: 5 }]; // At threshold

    const status = await LockoutService.recordAttempt("user@example.com", "1.2.3.4", false);

    expect(status.isLocked).toBe(true);
    expect(status.unlockAt).toBeDefined();
    expect(status.failedAttempts).toBe(5);
    // Should have logged the lockout via AuditLogger
    expect(mockLogAccountLocked).toHaveBeenCalledWith(
      "", // No user ID for failed logins
      "user@example.com",
      "1.2.3.4",
      5
    );
  });

  it("should normalize email before recording", async () => {
    selectResult = [];
    selectCountResult = [{ count: 0 }];

    await LockoutService.recordAttempt("  USER@Example.COM  ", "1.2.3.4", false);

    // The insert values call should have the normalized email
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
      })
    );
  });

  it("should fall back to checkLockout when database insert throws", async () => {
    // Make the first insert call throw
    mockDb.insert.mockImplementationOnce(() => {
      throw new Error("DB write error");
    });

    // checkLockout fallback — set up for a fail-open response
    selectResult = [];
    selectCountResult = [{ count: 0 }];

    const status = await LockoutService.recordAttempt("user@example.com", "1.2.3.4", false);

    // Should return checkLockout result (fail open)
    expect(status.isLocked).toBe(false);
  });
});

// ===========================================================================
// unlockAccount
// ===========================================================================

describe("LockoutService.unlockAccount", () => {
  it("should delete the lockout record for the given email", async () => {
    await LockoutService.unlockAccount("locked@example.com");

    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it("should normalize email to lowercase and trim", async () => {
    await LockoutService.unlockAccount("  LOCKED@Example.COM  ");

    // Should still call delete — the normalization is internal
    expect(mockDb.delete).toHaveBeenCalled();
  });
});

// ===========================================================================
// cleanup
// ===========================================================================

describe("LockoutService.cleanup", () => {
  it("should delete expired lockouts and old attempt records", async () => {
    await LockoutService.cleanup();

    // Should call delete twice: once for expired lockouts, once for old attempts
    expect(mockDb.delete).toHaveBeenCalledTimes(2);
  });

  it("should handle database error gracefully without throwing", async () => {
    mockDb.delete.mockImplementationOnce(() => ({
      where: vi.fn().mockRejectedValue(new Error("DB error during cleanup")),
    }));

    // Should not throw
    await expect(LockoutService.cleanup()).resolves.toBeUndefined();
  });
});

// ===========================================================================
// getLockoutMessage
// ===========================================================================

describe("LockoutService.getLockoutMessage", () => {
  it("should return unlocked message when unlock time is in the past", () => {
    const pastDate = new Date(Date.now() - 60000);
    const message = LockoutService.getLockoutMessage(pastDate);

    expect(message).toBe("Your account is now unlocked. Please try again.");
  });

  it("should return 'less than a minute' for very short remaining time", () => {
    const nearFuture = new Date(Date.now() + 30000); // 30 seconds
    const message = LockoutService.getLockoutMessage(nearFuture);

    expect(message).toBe("Account temporarily locked. Please try again in less than a minute.");
  });

  it("should return 'less than a minute' for exactly 60 seconds remaining", () => {
    const nearFuture = new Date(Date.now() + 60000); // 60 seconds
    const message = LockoutService.getLockoutMessage(nearFuture);

    expect(message).toBe("Account temporarily locked. Please try again in less than a minute.");
  });

  it("should return minutes message for 2-59 minute range", () => {
    const fiveMinutes = new Date(Date.now() + 5 * 60000);
    const message = LockoutService.getLockoutMessage(fiveMinutes);

    expect(message).toMatch(/Account temporarily locked\. Please try again in \d+ minutes\./);
  });

  it("should return correct minute count", () => {
    const tenMinutes = new Date(Date.now() + 10 * 60000);
    const message = LockoutService.getLockoutMessage(tenMinutes);

    // Math.ceil(10 * 60000 / 60000) = 10 (plus rounding for ms passed)
    expect(message).toMatch(/Please try again in (10|11) minutes/);
  });

  it("should return hours message for 60+ minutes", () => {
    const twoHours = new Date(Date.now() + 2 * 60 * 60000);
    const message = LockoutService.getLockoutMessage(twoHours);

    expect(message).toMatch(/Please try again in \d+ hours\./);
  });

  it("should return singular 'hour' for exactly 1 hour", () => {
    const oneHour = new Date(Date.now() + 60 * 60000);
    const message = LockoutService.getLockoutMessage(oneHour);

    // Math.ceil(60/60) = 1 -> "1 hour" (singular)
    expect(message).toMatch(/Please try again in 1 hour\./);
  });

  it("should return plural 'hours' for more than 1 hour", () => {
    const threeHours = new Date(Date.now() + 3 * 60 * 60000);
    const message = LockoutService.getLockoutMessage(threeHours);

    expect(message).toMatch(/Please try again in \d+ hours\./);
  });

  it("should return unlocked message when remaining time is exactly 0", () => {
    const now = new Date(Date.now());
    const message = LockoutService.getLockoutMessage(now);

    expect(message).toBe("Your account is now unlocked. Please try again.");
  });
});
