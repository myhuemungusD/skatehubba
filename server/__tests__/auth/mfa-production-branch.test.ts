/**
 * @fileoverview Coverage test for server/auth/mfa.ts — production branch
 *
 * Covers uncovered lines 61-62, 68:
 * - Line 61-62: Dedicated MFA_ENCRYPTION_KEY when available and >= 32 chars
 * - Line 68: Production throw when MFA_ENCRYPTION_KEY is not set
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ===========================================================================
// Mocks
// ===========================================================================

vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
  },
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  })),
}));

vi.mock("../../../packages/shared/schema/index", () => ({
  mfaSecrets: {
    userId: "userId",
    secret: "secret",
    backupCodes: "backupCodes",
    enabled: "enabled",
    verifiedAt: "verifiedAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("../../auth/audit", () => ({
  AuditLogger: {
    logMfaEvent: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
  },
  AUDIT_EVENTS: {
    MFA_BACKUP_CODES_REGENERATED: "MFA_BACKUP_CODES_REGENERATED",
  },
}));

const ORIGINAL_ENV = process.env;

describe("MFA getMfaBaseKey — dedicated key branch (lines 60-62)", () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.resetModules();
  });

  it("uses dedicated MFA_ENCRYPTION_KEY when set and >= 32 chars", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      MFA_ENCRYPTION_KEY: "a-dedicated-mfa-key-that-is-at-least-32-chars-long!!",
      NODE_ENV: "test",
    };

    const { MfaService } = await import("../../auth/mfa");

    // initiateSetup exercises encrypt() which calls getMfaBaseKey()
    const result = await MfaService.initiateSetup("user-1", "user@test.com");

    expect(result).toHaveProperty("secret");
    expect(result).toHaveProperty("qrCodeUrl");
    expect(result).toHaveProperty("backupCodes");
    expect(result.backupCodes).toHaveLength(10);
  });
});

describe("MFA getMfaBaseKey — production throw (line 67-71)", () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.resetModules();
  });

  it("throws in production when MFA_ENCRYPTION_KEY is not set", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
    };
    delete process.env.MFA_ENCRYPTION_KEY;

    const { MfaService } = await import("../../auth/mfa");

    // This should throw because we're in production without MFA_ENCRYPTION_KEY
    await expect(MfaService.initiateSetup("user-1", "user@test.com")).rejects.toThrow(
      "MFA_ENCRYPTION_KEY is required in production"
    );
  });

  it("throws in production when MFA_ENCRYPTION_KEY is too short", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      MFA_ENCRYPTION_KEY: "too-short",
      NODE_ENV: "production",
    };

    const { MfaService } = await import("../../auth/mfa");

    await expect(MfaService.initiateSetup("user-1", "user@test.com")).rejects.toThrow(
      "MFA_ENCRYPTION_KEY is required in production"
    );
  });
});
