/**
 * Tests for auth/mfa/crypto.ts
 * Covers getMfaBaseKey branches: dedicated key (lines 38-39),
 * production throw (line 45), and encrypt/decrypt roundtrip
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: "test-jwt-secret-that-is-at-least-32-characters-long!!",
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

describe("MFA crypto", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it("uses dedicated MFA_ENCRYPTION_KEY when set and >=32 chars", async () => {
    process.env.MFA_ENCRYPTION_KEY = "a-dedicated-mfa-key-that-is-at-least-32-characters!!";
    process.env.NODE_ENV = "test";

    const { encrypt, decrypt } = await import("../mfa/crypto");

    const plaintext = "JBSWY3DPEHPK3PXP";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
    expect(encrypted).toContain("v2$");
  });

  it("throws in production when MFA_ENCRYPTION_KEY is not set", async () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    process.env.NODE_ENV = "production";

    const { encrypt } = await import("../mfa/crypto");

    expect(() => encrypt("test")).toThrow("MFA_ENCRYPTION_KEY is required in production");
  });

  it("falls back to JWT_SECRET in development when MFA_ENCRYPTION_KEY not set", async () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    process.env.NODE_ENV = "test";

    const { encrypt, decrypt } = await import("../mfa/crypto");
    const logger = (await import("../../logger")).default;

    const plaintext = "TOTP_SECRET_123";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("MFA_ENCRYPTION_KEY not set"));
  });

  it("falls back to JWT_SECRET when MFA_ENCRYPTION_KEY is too short", async () => {
    process.env.MFA_ENCRYPTION_KEY = "short-key";
    process.env.NODE_ENV = "test";

    const { encrypt, decrypt } = await import("../mfa/crypto");

    const plaintext = "SHORT_KEY_TEST";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });
});
