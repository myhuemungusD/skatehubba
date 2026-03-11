/**
 * @fileoverview Unit tests for server/utils/ip.ts
 *
 * Tests:
 * - getClientIp — extract client IP from req.ip / socket.remoteAddress
 * - hashIp — SHA-256 hash IP with salt
 */

import { describe, it, expect } from "vitest";
import { getClientIp, hashIp } from "../utils/ip";
import crypto from "node:crypto";

// ============================================================================
// Tests
// ============================================================================

describe("getClientIp", () => {
  it("should return req.ip when present", () => {
    expect(getClientIp({ ip: "203.0.113.1" })).toBe("203.0.113.1");
  });

  it("should fall back to socket.remoteAddress when req.ip is undefined", () => {
    expect(getClientIp({ ip: undefined, socket: { remoteAddress: "10.0.0.1" } })).toBe("10.0.0.1");
  });

  it("should return 'unknown' when no IP info is available", () => {
    expect(getClientIp({})).toBe("unknown");
  });

  it("should return 'unknown' when ip is empty string", () => {
    expect(getClientIp({ ip: "" })).toBe("unknown");
  });

  it("should prefer req.ip over socket.remoteAddress", () => {
    expect(getClientIp({ ip: "1.2.3.4", socket: { remoteAddress: "5.6.7.8" } })).toBe("1.2.3.4");
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
