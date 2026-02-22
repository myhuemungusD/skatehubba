/**
 * @fileoverview Critical path tests for MFA (Multi-Factor Authentication)
 *
 * Tests the TOTP-based MFA flow:
 * - Secret generation (base32 format) and QR code URL construction
 * - TOTP code verification (invalid code rejection)
 * - Encrypted secret storage (verifies ciphertext is stored, not plaintext)
 * - Backup code generation and verification
 * - MFA setup, verify-setup, and disable lifecycle
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

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
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Track MFA records in memory
const mfaStore = new Map<string, any>();

vi.mock("../../db", () => ({
  db: null,
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          // Return the last queried MFA record
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
            // Simulate upsert
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
      set: vi.fn().mockImplementation((updates: any) => {
        return {
          where: vi.fn().mockImplementation(() => {
            // Update the last record
            for (const [key, record] of mfaStore.entries()) {
              mfaStore.set(key, { ...record, ...updates });
            }
            return Promise.resolve();
          }),
        };
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        mfaStore.clear();
        return Promise.resolve();
      }),
    }),
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  isDatabaseAvailable: () => false,
}));

vi.mock("../../auth/audit", () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
    logMfaEvent: vi.fn().mockResolvedValue(undefined),
  },
  AUDIT_EVENTS: {},
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const { MfaService } = await import("../../auth/mfa");

// ============================================================================
// Tests
// ============================================================================

describe("MFA - Critical Paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mfaStore.clear();
  });

  // ==========================================================================
  // MFA Setup
  // ==========================================================================

  describe("initiateSetup", () => {
    it("returns secret, QR code URL, and backup codes", async () => {
      const result = await MfaService.initiateSetup("user-1", "user@test.com");

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(10);
      // Base32 characters only
      expect(result.secret).toMatch(/^[A-Z2-7]+$/);

      expect(result.qrCodeUrl).toContain("otpauth://totp/");
      expect(result.qrCodeUrl).toContain("user%40test.com");
      expect(result.qrCodeUrl).toContain("SkateHubba");
      expect(result.qrCodeUrl).toContain(result.secret);

      expect(result.backupCodes).toHaveLength(10);
      // Backup codes should be 8 chars, uppercase + numbers
      for (const code of result.backupCodes) {
        expect(code).toHaveLength(8);
        expect(code).toMatch(/^[A-Z0-9]+$/);
      }
    });

    it("generates unique secrets for each setup", async () => {
      const result1 = await MfaService.initiateSetup("user-1", "user1@test.com");
      mfaStore.clear();
      const result2 = await MfaService.initiateSetup("user-2", "user2@test.com");

      expect(result1.secret).not.toBe(result2.secret);
    });

    it("generates unique backup codes", async () => {
      const result = await MfaService.initiateSetup("user-1", "user@test.com");
      const uniqueCodes = new Set(result.backupCodes);
      expect(uniqueCodes.size).toBe(10);
    });

    it("stores encrypted secret in database", async () => {
      await MfaService.initiateSetup("user-1", "user@test.com");

      expect(mfaStore.has("user-1")).toBe(true);
      const stored = mfaStore.get("user-1");
      expect(stored.enabled).toBe(false);
      // Secret should be encrypted (hex string much longer than base32)
      expect(stored.secret.length).toBeGreaterThan(40);
    });
  });

  // ==========================================================================
  // MFA Enable/Disable Lifecycle
  // ==========================================================================

  describe("isEnabled", () => {
    it("returns false when no MFA record exists", async () => {
      mfaStore.clear();
      // Mock empty select result for this test
      const result = await MfaService.isEnabled("user-no-mfa");
      expect(result).toBe(false);
    });

    it("returns false when MFA is set up but not verified", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: false,
        secret: "encrypted-secret",
      });

      const result = await MfaService.isEnabled("user-1");
      expect(result).toBe(false);
    });

    it("returns true when MFA is enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
        secret: "encrypted-secret",
      });

      const result = await MfaService.isEnabled("user-1");
      expect(result).toBe(true);
    });
  });

  describe("disable", () => {
    it("removes MFA record from database", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
        secret: "encrypted-secret",
      });

      await MfaService.disable("user-1", "user@test.com", "127.0.0.1");

      expect(mfaStore.size).toBe(0);
    });
  });

  // ==========================================================================
  // TOTP Verification (end-to-end through initiateSetup + verifySetup)
  // ==========================================================================

  describe("verifySetup (TOTP verification)", () => {
    it("rejects invalid code during setup", async () => {
      // First set up MFA
      await MfaService.initiateSetup("user-1", "user@test.com");

      // Try to verify with a wrong code
      const result = await MfaService.verifySetup("user-1", "user@test.com", "000000", "127.0.0.1");

      expect(result).toBe(false);
    });

    it("returns false when no MFA record exists", async () => {
      mfaStore.clear();
      const result = await MfaService.verifySetup(
        "nonexistent",
        "user@test.com",
        "123456",
        "127.0.0.1"
      );
      expect(result).toBe(false);
    });
  });

  describe("verifyCode", () => {
    it("returns false when MFA not enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: false,
        secret: "encrypted",
      });

      const result = await MfaService.verifyCode("user-1", "user@test.com", "123456", "127.0.0.1");
      expect(result).toBe(false);
    });

    it("returns false when no MFA record exists", async () => {
      mfaStore.clear();
      const result = await MfaService.verifyCode(
        "nonexistent",
        "user@test.com",
        "123456",
        "127.0.0.1"
      );
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Backup Codes
  // ==========================================================================

  describe("verifyBackupCode", () => {
    it("returns false when MFA not enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: false,
        backupCodes: [],
      });

      const result = await MfaService.verifyBackupCode(
        "user-1",
        "user@test.com",
        "TESTCODE",
        "127.0.0.1"
      );
      expect(result).toBe(false);
    });

    it("returns false when no backup codes exist", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: true,
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
  });

  describe("regenerateBackupCodes", () => {
    it("returns null when MFA not enabled", async () => {
      mfaStore.set("user-1", {
        userId: "user-1",
        enabled: false,
      });

      const codes = await MfaService.regenerateBackupCodes("user-1", "user@test.com", "127.0.0.1");
      expect(codes).toBeNull();
    });
  });

  // ==========================================================================
  // v2 Encryption Format
  // ==========================================================================

  describe("v2 encryption format", () => {
    it("stores secrets with v2$ prefix (random salt)", async () => {
      await MfaService.initiateSetup("user-1", "user@test.com");

      const stored = mfaStore.get("user-1");
      expect(stored.secret.startsWith("v2$")).toBe(true);
    });

    it("can decrypt v2-encrypted secrets (roundtrip via setup + verify)", async () => {
      // initiateSetup encrypts with v2; verifySetup decrypts to verify the TOTP code
      const setup = await MfaService.initiateSetup("user-1", "user@test.com");

      // Generate a correct TOTP code from the plaintext secret
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

      const result = await MfaService.verifySetup("user-1", "user@test.com", otp, "127.0.0.1");
      expect(result).toBe(true);
    });

    it("can decrypt legacy (pre-v2) ciphertexts for backward compatibility", async () => {
      // Build a legacy-format ciphertext: iv(32hex) + authTag(32hex) + encrypted(hex)
      // Key derivation: scryptSync(JWT_SECRET, "mfa-salt", 32)
      const crypto = await import("crypto");
      const testSecret = "JBSWY3DPEHPK3PXP"; // well-known test base32 secret

      const key = crypto.scryptSync("test-jwt-secret-at-least-32-characters-long!", "mfa-salt", 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      let encrypted = cipher.update(testSecret, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag();
      const legacyCiphertext = iv.toString("hex") + authTag.toString("hex") + encrypted;

      // Should NOT start with v2$
      expect(legacyCiphertext.startsWith("v2$")).toBe(false);

      // Store as if it were a legacy record, then verify a TOTP code against it
      mfaStore.set("user-legacy", {
        userId: "user-legacy",
        enabled: false,
        secret: legacyCiphertext,
        backupCodes: [],
      });

      // Generate a correct TOTP code from testSecret
      const now = Date.now();
      const counter = Math.floor(now / 1000 / 30);
      const counterBuffer = Buffer.alloc(8);
      counterBuffer.writeBigUInt64BE(BigInt(counter));

      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const cleanStr = testSecret.toUpperCase().replace(/[^A-Z2-7]/g, "");
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

      // verifySetup will call decrypt(legacyCiphertext) → legacy path → testSecret
      const result = await MfaService.verifySetup(
        "user-legacy",
        "legacy@test.com",
        otp,
        "127.0.0.1"
      );
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // QR Code URL Format
  // ==========================================================================

  describe("QR code URL format", () => {
    it("includes all required TOTP parameters", async () => {
      const result = await MfaService.initiateSetup("user-1", "user@test.com");
      const qrUrl = result.qrCodeUrl;

      // otpauth:// URLs have non-standard structure, parse manually
      expect(qrUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(qrUrl).toContain("SkateHubba");
      expect(qrUrl).toContain("user%40test.com");
      expect(qrUrl).toContain(`secret=${result.secret}`);
      expect(qrUrl).toContain("algorithm=SHA1");
      expect(qrUrl).toContain("digits=6");
      expect(qrUrl).toContain("period=30");
    });
  });
});
