/**
 * Branch coverage tests for server/utils/ip.ts
 * Covers lines 7, 10, 17 — the || null fallback when first element is empty after trim
 */
import { describe, it, expect } from "vitest";
import { getClientIp } from "../../utils/ip";

describe("getClientIp — branch coverage", () => {
  describe("Line 7: x-forwarded-for string split yields empty first element", () => {
    it("should return null when x-forwarded-for first element is empty after trim", () => {
      // The split produces an entry that is empty string or only whitespace
      const req = { headers: { "x-forwarded-for": ", 10.0.0.1" }, ip: "127.0.0.1" };
      expect(getClientIp(req as any)).toBeNull();
    });

    it("should return null when x-forwarded-for first entry is undefined (empty split)", () => {
      // split(",")[0] could be empty string "" which is falsy
      const req = { headers: { "x-forwarded-for": "  ,  " }, ip: "127.0.0.1" };
      expect(getClientIp(req as any)).toBeNull();
    });
  });

  describe("Line 10: x-forwarded-for array first element is empty after trim", () => {
    it("should return null when array first element is empty string", () => {
      const req = { headers: { "x-forwarded-for": ["", "10.0.0.2"] }, ip: "127.0.0.1" };
      expect(getClientIp(req as any)).toBeNull();
    });

    it("should return null when array first element is whitespace only", () => {
      const req = { headers: { "x-forwarded-for": ["  ", "10.0.0.2"] }, ip: "127.0.0.1" };
      expect(getClientIp(req as any)).toBeNull();
    });
  });

  describe("Line 17: x-real-ip array first element is empty after trim", () => {
    it("should return null when x-real-ip array first element is empty string", () => {
      const req = { headers: { "x-real-ip": ["", "10.0.0.3"] }, ip: "127.0.0.1" };
      expect(getClientIp(req as any)).toBeNull();
    });

    it("should return null when x-real-ip array first element is whitespace only", () => {
      const req = { headers: { "x-real-ip": ["  "] }, ip: "127.0.0.1" };
      expect(getClientIp(req as any)).toBeNull();
    });
  });
});
