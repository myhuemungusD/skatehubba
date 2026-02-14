/**
 * @fileoverview Extended MFA tests to improve coverage of server/auth/mfa.ts
 *
 * Covers areas not exercised by mfa-critical-paths.test.ts:
 * - verifyBackupCode: all branches (no record, not enabled, no codes,
 *   valid code removal, invalid code audit logging)
 * - regenerateBackupCodes: no record, not enabled, success path
 * - verifyCode: valid/invalid code with audit logging
 * - verifySetup: no MFA record edge case
 * - isEnabled: enabled vs missing record
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
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

// Track MFA records in memory, keyed by userId
const mfaStore = new Map<string, any>();

const mockWhere = vi.fn();
const mockSetReturn = { where: mockWhere };
const mockSet = vi.fn().mockReturnValue(mockSetReturn);
const mockDeleteWhere = vi.fn();

vi.mock("../db", () => ({
  db: null,
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((..._args: any[]) => {
          // Return all records from the store (the caller destructures [record])
          const records = Array.from(mfaStore.values());
          return Promise.resolve(records.length > 0 ? [records[records.length - 1]] : []);
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((data: any) => {
        mfaStore.set(data.userId, data);
        return {
          onConflictDoUpdate: vi.fn().mockImplementation((opts: any) => {
            if (mfaStore.has(data.userId)) {
              const existing = mfaStore.get(data.userId);
              mfaStore.set(data.userId, { ...existing, ...opts.set, ...data });
            }
            return Promise.resolve();
          }),
        };
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: mockSet,
    }),
    delete: vi.fn().mockReturnValue({
      where: mockDeleteWhere.mockImplementation(() => {
        mfaStore.clear();
        return Promise.resolve();
      }),
    }),
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  isDatabaseAvailable: () => false,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => args),
}));

vi.mock("../../packages/shared/schema/index", () => ({
  mfaSecrets: {
    userId: "userId",
    secret: "secret",
    backupCodes: "backupCodes",
    enabled: "enabled",
    verifiedAt: "verifiedAt",
    updatedAt: "updatedAt",
  },
}));

const mockLogMfaEvent = vi.fn().mockResolvedValue(undefined);
const mockAuditLog = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/audit", () => ({
  AuditLogger: {
    log: mockAuditLog,
    logMfaEvent: mockLogMfaEvent,
  },
  AUDIT_EVENTS: {
    MFA_BACKUP_CODES_REGENERATED: "mfa.backup_codes_regenerated",
  },
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockImplementation((value: string) => Promise.resolve(`hashed:${value}`)),
    compare: vi
      .fn()
      .mockImplementation((plain: string, hashed: string) =>
        Promise.resolve(hashed === `hashed:${plain.toUpperCase().replace(/[^A-Z0-9]/g, "")}`)
      ),
  },
}));

// ============================================================================
// Import after mocks
// ============================================================================

const { MfaService } = await import("../auth/mfa");

// ============================================================================
// Tests
// ============================================================================

describe("MFA - Extended Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mfaStore.clear();

    // Reset the update mock chain so each test starts fresh
    mockWhere.mockImplementation((..._args: any[]) => {
      // Apply the update to the last record in the store
      for (const [key, record] of mfaStore.entries()) {
        // The `set` data was captured by mockSet; grab it from the last call
        const lastSetCall = mockSet.mock.calls[mockSet.mock.calls.length - 1];
        if (lastSetCall) {
          mfaStore.set(key, { ...record, ...lastSetCall[0] });
        }
      }
      return Promise.resolve();
    });
  });

  // ==========================================================================
  // verifyBackupCode
  // ==========================================================================

  describe("verifyBackupCode", () => {
    it("returns false when no MFA record is found", async () => {
      // mfaStore is empty
      const result = await MfaService.verifyBackupCode(
        "no-such-user",
        "user@test.com",
        "ABCD1234",
        "127.0.0.1"
      );
      expect(result).toBe(false);
    });

    it("returns false when MFA is not enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: false,
        secret: "encrypted-secret",
        backupCodes: ["hashed:ABCD1234"],
      });

      const result = await MfaService.verifyBackupCode(
        "user-1",
        "user@test.com",
        "ABCD1234",
        "127.0.0.1"
      );
      expect(result).toBe(false);
    });

    it("returns false when backup codes array is null", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
        secret: "encrypted-secret",
        backupCodes: null,
      });

      const result = await MfaService.verifyBackupCode(
        "user-1",
        "user@test.com",
        "TESTCODE",
        "127.0.0.1"
      );
      expect(result).toBe(false);
    });

    it("returns true and removes the used backup code when it matches", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
        secret: "encrypted-secret",
        backupCodes: ["hashed:WRONGCODE", "hashed:VALIDCODE", "hashed:ANOTHERCODE"],
      });

      const result = await MfaService.verifyBackupCode(
        "user-1",
        "user@test.com",
        "VALIDCODE",
        "127.0.0.1",
        "TestBrowser/1.0"
      );

      expect(result).toBe(true);

      // The update should have been called with the code removed
      expect(mockSet).toHaveBeenCalled();
      const setArg = mockSet.mock.calls[0][0];
      expect(setArg.backupCodes).toHaveLength(2);
      expect(setArg.backupCodes).toContain("hashed:WRONGCODE");
      expect(setArg.backupCodes).toContain("hashed:ANOTHERCODE");
      expect(setArg.backupCodes).not.toContain("hashed:VALIDCODE");

      // Audit success should be logged
      expect(mockLogMfaEvent).toHaveBeenCalledWith(
        "user-1",
        "user@test.com",
        "127.0.0.1",
        "success",
        "TestBrowser/1.0"
      );
    });

    it("normalizes the backup code (uppercase, strip non-alphanumeric)", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
        secret: "encrypted-secret",
        backupCodes: ["hashed:VALIDCODE"],
      });

      // Pass in lowercase with dashes - should be normalized to VALIDCODE
      const result = await MfaService.verifyBackupCode(
        "user-1",
        "user@test.com",
        "valid-code",
        "127.0.0.1"
      );

      expect(result).toBe(true);
    });

    it("returns false and logs audit failure for an invalid backup code", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
        secret: "encrypted-secret",
        backupCodes: ["hashed:REALCODE1", "hashed:REALCODE2"],
      });

      const result = await MfaService.verifyBackupCode(
        "user-1",
        "user@test.com",
        "WRONGCODE",
        "10.0.0.1",
        "EvilBrowser/2.0"
      );

      expect(result).toBe(false);

      // Audit failure should be logged
      expect(mockLogMfaEvent).toHaveBeenCalledWith(
        "user-1",
        "user@test.com",
        "10.0.0.1",
        "failure",
        "EvilBrowser/2.0"
      );
    });
  });

  // ==========================================================================
  // regenerateBackupCodes
  // ==========================================================================

  describe("regenerateBackupCodes", () => {
    it("returns null when no MFA record exists", async () => {
      // mfaStore is empty
      const result = await MfaService.regenerateBackupCodes(
        "nonexistent",
        "user@test.com",
        "127.0.0.1"
      );
      expect(result).toBeNull();
    });

    it("returns null when MFA is not enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: false,
        secret: "encrypted-secret",
        backupCodes: ["old-hashed-code"],
      });

      const result = await MfaService.regenerateBackupCodes("user-1", "user@test.com", "127.0.0.1");
      expect(result).toBeNull();
    });

    it("returns new backup codes and updates the database when MFA is enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
        secret: "encrypted-secret",
        backupCodes: ["old-hashed-code"],
      });

      const result = await MfaService.regenerateBackupCodes(
        "user-1",
        "user@test.com",
        "127.0.0.1",
        "TestBrowser/1.0"
      );

      expect(result).not.toBeNull();
      expect(result).toHaveLength(10);
      // Each code should be 8 characters, uppercase + numbers
      for (const code of result!) {
        expect(code).toHaveLength(8);
        expect(code).toMatch(/^[A-Z0-9]+$/);
      }

      // DB update should have been called with hashed codes
      expect(mockSet).toHaveBeenCalled();
      const setArg = mockSet.mock.calls[0][0];
      expect(setArg.backupCodes).toHaveLength(10);
      // Each stored code should be a hashed version
      for (const hashed of setArg.backupCodes) {
        expect(hashed).toMatch(/^hashed:/);
      }

      // Audit log should record the regeneration
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "mfa.backup_codes_regenerated",
          userId: "user-1",
          email: "user@test.com",
          ipAddress: "127.0.0.1",
          userAgent: "TestBrowser/1.0",
          success: true,
        })
      );
    });
  });

  // ==========================================================================
  // verifyCode
  // ==========================================================================

  describe("verifyCode", () => {
    it("returns false when no MFA record exists", async () => {
      // mfaStore is empty
      const result = await MfaService.verifyCode(
        "nonexistent",
        "user@test.com",
        "123456",
        "127.0.0.1"
      );
      expect(result).toBe(false);
    });

    it("returns false when MFA is not enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: false,
        secret: "encrypted-secret",
        backupCodes: [],
      });

      const result = await MfaService.verifyCode("user-1", "user@test.com", "123456", "127.0.0.1");
      expect(result).toBe(false);
    });

    it("returns true and logs audit success for a valid TOTP code", async () => {
      // Use initiateSetup to get a real encrypted secret and a real TOTP code
      const setup = await MfaService.initiateSetup("user-1", "user@test.com");
      // Enable the record so verifyCode proceeds past the guard
      const record = mfaStore.get("user-1");
      mfaStore.set("user-1", { ...record, enabled: true });

      // Generate the correct TOTP code using the real crypto internals
      // We can import the helpers indirectly by computing the code ourselves.
      // Instead, we use verifySetup's approach: generate a TOTP with the secret.
      const crypto = await import("crypto");
      const secret = setup.secret;

      // Replicate TOTP generation from the source
      const now = Date.now();
      const counter = Math.floor(now / 1000 / 30);
      const counterBuffer = Buffer.alloc(8);
      counterBuffer.writeBigUInt64BE(BigInt(counter));

      // Base32 decode
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const cleanStr = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
      let bits = 0;
      let value = 0;
      const decoded: number[] = [];
      for (const char of cleanStr) {
        value = (value << 5) | alphabet.indexOf(char);
        bits += 5;
        if (bits >= 8) {
          decoded.push((value >>> (bits - 8)) & 0xff);
          bits -= 8;
        }
      }
      const secretBuffer = Buffer.from(decoded);

      const hmac = crypto.createHmac("sha1", secretBuffer);
      hmac.update(counterBuffer);
      const hash = hmac.digest();
      const offset = hash[hash.length - 1] & 0x0f;
      const binary =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);
      const otp = (binary % 1000000).toString().padStart(6, "0");

      vi.clearAllMocks();

      const result = await MfaService.verifyCode(
        "user-1",
        "user@test.com",
        otp,
        "10.0.0.1",
        "Chrome/100"
      );

      expect(result).toBe(true);
      expect(mockLogMfaEvent).toHaveBeenCalledWith(
        "user-1",
        "user@test.com",
        "10.0.0.1",
        "success",
        "Chrome/100"
      );
    });

    it("returns false and logs audit failure for an invalid TOTP code", async () => {
      // Set up MFA with a real encrypted secret
      await MfaService.initiateSetup("user-1", "user@test.com");
      const record = mfaStore.get("user-1");
      mfaStore.set("user-1", { ...record, enabled: true });

      vi.clearAllMocks();

      const result = await MfaService.verifyCode(
        "user-1",
        "user@test.com",
        "000000",
        "10.0.0.1",
        "Firefox/99"
      );

      expect(result).toBe(false);
      expect(mockLogMfaEvent).toHaveBeenCalledWith(
        "user-1",
        "user@test.com",
        "10.0.0.1",
        "failure",
        "Firefox/99"
      );
    });
  });

  // ==========================================================================
  // verifySetup edge cases
  // ==========================================================================

  describe("verifySetup", () => {
    it("returns false when no MFA record exists", async () => {
      // mfaStore is empty
      const result = await MfaService.verifySetup(
        "nonexistent",
        "user@test.com",
        "123456",
        "127.0.0.1"
      );
      expect(result).toBe(false);
    });

    it("returns true and enables MFA when a valid code is provided", async () => {
      // Set up MFA with real secret
      const setup = await MfaService.initiateSetup("user-1", "user@test.com");

      // Generate correct TOTP code
      const crypto = await import("crypto");
      const secret = setup.secret;
      const now = Date.now();
      const counter = Math.floor(now / 1000 / 30);
      const counterBuffer = Buffer.alloc(8);
      counterBuffer.writeBigUInt64BE(BigInt(counter));

      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const cleanStr = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
      let bits = 0;
      let value = 0;
      const decoded: number[] = [];
      for (const char of cleanStr) {
        value = (value << 5) | alphabet.indexOf(char);
        bits += 5;
        if (bits >= 8) {
          decoded.push((value >>> (bits - 8)) & 0xff);
          bits -= 8;
        }
      }
      const secretBuffer = Buffer.from(decoded);

      const hmac = crypto.createHmac("sha1", secretBuffer);
      hmac.update(counterBuffer);
      const hash = hmac.digest();
      const offset = hash[hash.length - 1] & 0x0f;
      const binary =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);
      const otp = (binary % 1000000).toString().padStart(6, "0");

      vi.clearAllMocks();

      const result = await MfaService.verifySetup(
        "user-1",
        "user@test.com",
        otp,
        "127.0.0.1",
        "Chrome/100"
      );

      expect(result).toBe(true);

      // Should have called update to enable MFA
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        })
      );

      // Should have logged the MFA enabled event
      expect(mockLogMfaEvent).toHaveBeenCalledWith(
        "user-1",
        "user@test.com",
        "127.0.0.1",
        "enabled",
        "Chrome/100"
      );
    });

    it("returns false for an invalid code during setup", async () => {
      await MfaService.initiateSetup("user-1", "user@test.com");

      const result = await MfaService.verifySetup("user-1", "user@test.com", "000000", "127.0.0.1");

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // isEnabled
  // ==========================================================================

  describe("isEnabled", () => {
    it("returns true when MFA record is enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
        secret: "encrypted-secret",
      });

      const result = await MfaService.isEnabled("user-1");
      expect(result).toBe(true);
    });

    it("returns false when no MFA record exists", async () => {
      // mfaStore is empty
      const result = await MfaService.isEnabled("nonexistent");
      expect(result).toBe(false);
    });

    it("returns false when MFA record exists but is not enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: false,
        secret: "encrypted-secret",
      });

      const result = await MfaService.isEnabled("user-1");
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // disable
  // ==========================================================================

  describe("disable", () => {
    it("removes MFA record and logs audit event", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
        secret: "encrypted-secret",
      });

      await MfaService.disable("user-1", "user@test.com", "127.0.0.1", "Chrome/100");

      expect(mfaStore.size).toBe(0);
      expect(mockLogMfaEvent).toHaveBeenCalledWith(
        "user-1",
        "user@test.com",
        "127.0.0.1",
        "disabled",
        "Chrome/100"
      );
    });
  });
});
