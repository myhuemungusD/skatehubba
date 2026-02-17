import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSelect,
  mockInsert,
  mockDelete,
  mockFrom,
  mockWhere,
  mockValues,
  mockOnConflictDoUpdate,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockValues: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
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

vi.mock("./audit", () => ({
  AuditLogger: {
    logAccountLocked: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../security", () => ({
  SECURITY_CONFIG: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 min
  },
}));

vi.mock("../../packages/shared/schema", () => ({
  loginAttempts: { email: "email", success: "success", createdAt: "createdAt" },
  accountLockouts: { email: "email", unlockAt: "unlockAt", failedAttempts: "failedAttempts" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gt: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(),
  count: vi.fn(() => "count"),
}));

import { LockoutService } from "./lockout";

describe("LockoutService.getLockoutMessage", () => {
  it("returns unlocked message for past date", () => {
    const pastDate = new Date(Date.now() - 60000);
    const message = LockoutService.getLockoutMessage(pastDate);
    expect(message).toBe("Your account is now unlocked. Please try again.");
  });

  it("returns less-than-a-minute message for < 1 minute remaining", () => {
    const soonDate = new Date(Date.now() + 30000); // 30 seconds
    const message = LockoutService.getLockoutMessage(soonDate);
    expect(message).toBe("Account temporarily locked. Please try again in less than a minute.");
  });

  it("returns minutes message for < 60 minutes remaining", () => {
    const futureDate = new Date(Date.now() + 10 * 60000); // 10 minutes
    const message = LockoutService.getLockoutMessage(futureDate);
    expect(message).toContain("minutes");
    expect(message).toMatch(/\d+ minutes/);
  });

  it("returns hours message for >= 60 minutes remaining", () => {
    const futureDate = new Date(Date.now() + 120 * 60000); // 2 hours
    const message = LockoutService.getLockoutMessage(futureDate);
    expect(message).toContain("hour");
    expect(message).toMatch(/2 hours/);
  });

  it("returns singular hour for 1 hour remaining", () => {
    const futureDate = new Date(Date.now() + 60 * 60000); // 1 hour
    const message = LockoutService.getLockoutMessage(futureDate);
    expect(message).toMatch(/1 hour[^s]/);
  });

  it("returns 15 minutes for standard lockout duration", () => {
    const futureDate = new Date(Date.now() + 15 * 60000); // 15 minutes
    const message = LockoutService.getLockoutMessage(futureDate);
    expect(message).toContain("15 minutes");
  });
});

describe("LockoutService.checkLockout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default chain: select().from().where() -> returns empty array (no lockout)
    mockWhere.mockResolvedValue([]);
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  it("returns not locked when no active lockout and no failed attempts", async () => {
    // First query (lockout check) returns empty
    // Second query (count attempts) returns 0
    let callCount = 0;
    mockWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([]); // no lockout
      return Promise.resolve([{ count: 0 }]); // 0 failed attempts
    });

    const status = await LockoutService.checkLockout("Test@Example.com");
    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(0);
    expect(status.remainingAttempts).toBe(5);
  });

  it("returns locked when active lockout exists", async () => {
    const unlockAt = new Date(Date.now() + 900000);
    mockWhere.mockResolvedValueOnce([{ unlockAt, failedAttempts: 5 }]);

    const status = await LockoutService.checkLockout("test@example.com");
    expect(status.isLocked).toBe(true);
    expect(status.unlockAt).toEqual(unlockAt);
    expect(status.failedAttempts).toBe(5);
  });

  it("normalizes email to lowercase and trims", async () => {
    mockWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

    await LockoutService.checkLockout("  TEST@EXAMPLE.COM  ");
    // Verify the email was processed (select was called)
    expect(mockSelect).toHaveBeenCalled();
  });

  it("fails open on database error", async () => {
    mockWhere.mockRejectedValue(new Error("DB connection failed"));

    const status = await LockoutService.checkLockout("test@example.com");
    expect(status.isLocked).toBe(false);
    expect(status.remainingAttempts).toBe(5);
  });
});

describe("LockoutService.recordAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockInsert.mockReturnValue({ values: mockValues });
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockWhere.mockResolvedValue([]);
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockDelete.mockReturnValue({ where: mockWhere });
  });

  it("clears lockout on successful login", async () => {
    // insert().values() resolves
    mockValues.mockResolvedValueOnce(undefined);
    // delete().where() resolves
    mockWhere.mockResolvedValueOnce(undefined);

    const status = await LockoutService.recordAttempt("test@example.com", "1.2.3.4", true);
    expect(status.isLocked).toBe(false);
    expect(status.failedAttempts).toBe(0);
    expect(status.remainingAttempts).toBe(5);
  });
});

describe("LockoutService.unlockAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockWhere });
  });

  it("calls delete on accountLockouts", async () => {
    await LockoutService.unlockAccount("test@example.com");
    expect(mockDelete).toHaveBeenCalled();
  });
});
