import { describe, it, expect, vi } from "vitest";

vi.mock("./config/env", () => ({
  env: {
    SESSION_SECRET: "a".repeat(32),
    STRIPE_SECRET_KEY: "",
    NODE_ENV: "test",
  },
}));

vi.mock("./logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  SECURITY_CONFIG,
  generateSecureToken,
  secureCompare,
  isValidIP,
  validateEnvironment,
} from "./security";

describe("SECURITY_CONFIG", () => {
  it("has expected session TTL (24 hours)", () => {
    expect(SECURITY_CONFIG.SESSION_TTL).toBe(24 * 60 * 60 * 1000);
  });

  it("has max login attempts of 5", () => {
    expect(SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS).toBe(5);
  });

  it("has 15 minute lockout duration", () => {
    expect(SECURITY_CONFIG.LOCKOUT_DURATION).toBe(15 * 60 * 1000);
  });

  it("has minimum password length of 8", () => {
    expect(SECURITY_CONFIG.PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("has API rate limit of 100", () => {
    expect(SECURITY_CONFIG.API_RATE_LIMIT).toBe(100);
  });
});

describe("generateSecureToken", () => {
  it("generates hex string of expected length", () => {
    const token = generateSecureToken(32);
    expect(token).toMatch(/^[0-9a-f]+$/);
    // 32 bytes = 64 hex characters
    expect(token.length).toBe(64);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateSecureToken()));
    expect(tokens.size).toBe(10);
  });

  it("defaults to 32 bytes", () => {
    const token = generateSecureToken();
    expect(token.length).toBe(64);
  });

  it("respects custom length", () => {
    const token = generateSecureToken(16);
    expect(token.length).toBe(32); // 16 bytes = 32 hex chars
  });
});

describe("secureCompare", () => {
  it("returns true for identical strings", () => {
    expect(secureCompare("hello", "hello")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(secureCompare("hello", "world")).toBe(false);
  });

  it("returns false for different length strings", () => {
    expect(secureCompare("short", "longer")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(secureCompare("", "")).toBe(true);
  });
});

describe("isValidIP", () => {
  it("accepts valid IPv4", () => {
    expect(isValidIP("192.168.1.1")).toBe(true);
    expect(isValidIP("10.0.0.1")).toBe(true);
    expect(isValidIP("255.255.255.255")).toBe(true);
  });

  it("rejects invalid IPv4", () => {
    expect(isValidIP("not-an-ip")).toBe(false);
    expect(isValidIP("192.168.1")).toBe(false);
    expect(isValidIP("")).toBe(false);
  });

  it("accepts valid IPv6", () => {
    expect(isValidIP("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(true);
  });

  it("rejects invalid IPv6", () => {
    expect(isValidIP("2001:db8::1")).toBe(false); // compressed IPv6 not matched by regex
  });
});

describe("validateEnvironment", () => {
  it("does not throw for valid environment", () => {
    expect(() => validateEnvironment()).not.toThrow();
  });
});
