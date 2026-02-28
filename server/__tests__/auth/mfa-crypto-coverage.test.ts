/**
 * @fileoverview Tests for uncovered lines in server/auth/mfa/crypto.ts
 *
 * Covers:
 * - Lines 38-39: MFA_ENCRYPTION_KEY set but < 32 chars, non-production → JWT_SECRET fallback
 * - Line 45: NODE_ENV === "production" with no valid MFA_ENCRYPTION_KEY → throws Error
 *
 * Because `_mfaBaseKey` is cached at module scope, each test uses
 * vi.resetModules() + vi.doMock() + dynamic await import() to get a fresh instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("MFA Crypto — getMfaBaseKey edge cases", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws in production when MFA_ENCRYPTION_KEY is missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.MFA_ENCRYPTION_KEY;

    vi.doMock("../../config/env", () => ({
      env: { JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!" },
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { encrypt } = await import("../../auth/mfa/crypto");
    expect(() => encrypt("test")).toThrow("MFA_ENCRYPTION_KEY is required in production");
  });

  it("throws in production when MFA_ENCRYPTION_KEY is too short", async () => {
    process.env.NODE_ENV = "production";
    process.env.MFA_ENCRYPTION_KEY = "short-key";

    vi.doMock("../../config/env", () => ({
      env: { JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!" },
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { encrypt } = await import("../../auth/mfa/crypto");
    expect(() => encrypt("test")).toThrow("MFA_ENCRYPTION_KEY is required in production");
  });

  it("falls back to JWT_SECRET in dev when MFA_ENCRYPTION_KEY is too short (lines 38-39)", async () => {
    process.env.NODE_ENV = "development";
    process.env.MFA_ENCRYPTION_KEY = "short";

    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock("../../config/env", () => ({
      env: { JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!" },
    }));
    vi.doMock("../../logger", () => ({ default: mockLogger }));

    const { encrypt, decrypt } = await import("../../auth/mfa/crypto");
    const encrypted = encrypt("hello-totp-secret");
    expect(encrypted).toBeDefined();
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("hello-totp-secret");
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("MFA_ENCRYPTION_KEY not set")
    );
  });

  it("falls back to JWT_SECRET in dev when MFA_ENCRYPTION_KEY is not set at all", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.MFA_ENCRYPTION_KEY;

    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock("../../config/env", () => ({
      env: { JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!" },
    }));
    vi.doMock("../../logger", () => ({ default: mockLogger }));

    const { encrypt, decrypt } = await import("../../auth/mfa/crypto");
    const encrypted = encrypt("another-secret");
    expect(encrypted).toBeDefined();
    expect(encrypted).toMatch(/^v2\$/);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("another-secret");
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("MFA_ENCRYPTION_KEY not set")
    );
  });
});
