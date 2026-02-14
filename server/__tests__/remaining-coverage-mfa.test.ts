/**
 * Coverage test for server/auth/mfa.ts — uncovered line 111
 *
 * Line 111: base32Encode remaining bits branch
 *   `if (bits > 0) { result += alphabet[(value << (5 - bits)) & 0x1f]; }`
 *
 * 20 bytes = 160 bits = exactly 32 base32 chars, so remaining bits are 0.
 * To exercise line 111 we need a buffer whose size in bits is not divisible by 5.
 * We mock crypto.randomBytes to return 3 bytes (24 bits → 4 remainder bits).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for the counter used by the mock
const { state } = vi.hoisted(() => ({ state: { callCount: 0 } }));

vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    default: {
      ...actual,
      randomBytes: (size: number) => {
        state.callCount++;
        // First call is from generateSecret → return 3 bytes to trigger remaining bits
        if (state.callCount === 1) {
          return Buffer.from([0xde, 0xad, 0xbe]);
        }
        return actual.randomBytes(size);
      },
    },
    randomBytes: (size: number) => {
      state.callCount++;
      if (state.callCount === 1) {
        return Buffer.from([0xde, 0xad, 0xbe]);
      }
      return actual.randomBytes(size);
    },
  };
});

vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
  },
}));

vi.mock("../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../db", () => ({
  db: null,
  getDb: () => ({
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

vi.mock("../auth/audit", () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
    logMfaEvent: vi.fn().mockResolvedValue(undefined),
  },
  AUDIT_EVENTS: {
    MFA_BACKUP_CODES_REGENERATED: "mfa.backup_codes_regenerated",
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockImplementation((value: string) => Promise.resolve(`hashed:${value}`)),
    compare: vi.fn().mockResolvedValue(false),
  },
}));

describe("MFA base32Encode — line 111 (remaining bits)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.callCount = 0;
  });

  it("exercises the remaining bits branch in base32Encode via generateSecret with non-standard buffer", async () => {
    const { MfaService } = await import("../auth/mfa");

    const result = await MfaService.initiateSetup("user-1", "user@test.com");

    // The secret should be a valid base32 string
    expect(result.secret).toBeDefined();
    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    // 3 bytes = 24 bits → 4 full 5-bit groups + 4 remaining bits = 5 characters
    expect(result.secret).toHaveLength(5);
  });
});
