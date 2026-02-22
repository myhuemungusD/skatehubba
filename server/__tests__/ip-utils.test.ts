/**
 * @fileoverview Unit tests for server/utils/ip.ts
 *
 * Tests:
 * - getClientIp — extract client IP from various headers
 * - hashIp — SHA-256 hash IP with salt
 */

import { describe, it, expect } from "vitest";
import { getClientIp, hashIp } from "../utils/ip";
import crypto from "node:crypto";

// ============================================================================
// Tests
// ============================================================================

describe("getClientIp", () => {
  it("should extract IP from x-forwarded-for string header", () => {
    const req = { headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" }, ip: "127.0.0.1" };
    expect(getClientIp(req as any)).toBe("203.0.113.1");
  });

  it("should extract first IP from x-forwarded-for with multiple values", () => {
    const req = { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" }, ip: "127.0.0.1" };
    expect(getClientIp(req as any)).toBe("1.2.3.4");
  });

  it("should handle x-forwarded-for as array", () => {
    const req = { headers: { "x-forwarded-for": ["198.51.100.1", "10.0.0.2"] }, ip: "127.0.0.1" };
    expect(getClientIp(req as any)).toBe("198.51.100.1");
  });

  it("should fall back to x-real-ip string header", () => {
    const req = { headers: { "x-real-ip": "192.0.2.1" }, ip: "127.0.0.1" };
    expect(getClientIp(req as any)).toBe("192.0.2.1");
  });

  it("should fall back to x-real-ip array header", () => {
    const req = { headers: { "x-real-ip": ["10.10.10.10"] }, ip: "127.0.0.1" };
    expect(getClientIp(req as any)).toBe("10.10.10.10");
  });

  it("should fall back to req.ip when no forwarded headers", () => {
    const req = { headers: {}, ip: "127.0.0.1" };
    expect(getClientIp(req as any)).toBe("127.0.0.1");
  });

  it("should return null when no IP info is available", () => {
    const req = { headers: {}, ip: undefined };
    expect(getClientIp(req as any)).toBeNull();
  });

  it("should trim whitespace from x-forwarded-for", () => {
    const req = { headers: { "x-forwarded-for": "  1.2.3.4 , 5.6.7.8" }, ip: "127.0.0.1" };
    expect(getClientIp(req as any)).toBe("1.2.3.4");
  });

  it("should skip empty x-forwarded-for string", () => {
    const req = { headers: { "x-forwarded-for": "  " }, ip: "10.0.0.1" };
    expect(getClientIp(req as any)).toBe("10.0.0.1");
  });

  it("should skip empty x-forwarded-for array", () => {
    const req = { headers: { "x-forwarded-for": [] as string[] }, ip: "10.0.0.1" };
    expect(getClientIp(req as any)).toBe("10.0.0.1");
  });
});

describe("hashIp", () => {
  it("should return a SHA-256 hex digest", () => {
    const result = hashIp("1.2.3.4", "test-salt");
    const expected = crypto.createHash("sha256").update("1.2.3.4:test-salt").digest("hex");
    expect(result).toBe(expected);
  });

  it("should produce different hashes for different salts", () => {
    const hash1 = hashIp("1.2.3.4", "salt-a");
    const hash2 = hashIp("1.2.3.4", "salt-b");
    expect(hash1).not.toBe(hash2);
  });

  it("should produce different hashes for different IPs", () => {
    const hash1 = hashIp("1.2.3.4", "salt");
    const hash2 = hashIp("5.6.7.8", "salt");
    expect(hash1).not.toBe(hash2);
  });
});
