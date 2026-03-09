import { describe, it, expect } from "vitest";

/**
 * Validates the VALID_UID regex used in profile/[uid].tsx for deep link
 * parameter validation. Firebase UIDs are 20–128 alphanumeric characters.
 */
const VALID_UID = /^[a-zA-Z0-9]{20,128}$/;

describe("VALID_UID regex", () => {
  describe("accepts valid Firebase UIDs", () => {
    it("accepts 20-char UID (minimum length)", () => {
      expect(VALID_UID.test("a".repeat(20))).toBe(true);
    });

    it("accepts 128-char UID (maximum length)", () => {
      expect(VALID_UID.test("a".repeat(128))).toBe(true);
    });

    it("accepts 50-char UID (typical Firebase UID length)", () => {
      expect(VALID_UID.test("AbCdEfGhIj1234567890AbCdEfGhIj12345678901234567890")).toBe(true);
    });

    it("accepts all digits", () => {
      expect(VALID_UID.test("1".repeat(28))).toBe(true);
    });

    it("accepts all letters", () => {
      expect(VALID_UID.test("abcdefghijklmnopqrstuvwxyz")).toBe(true);
    });

    it("accepts mixed case alphanumeric", () => {
      expect(VALID_UID.test("AbCdEfGhIj1234567890")).toBe(true);
    });
  });

  describe("rejects invalid inputs", () => {
    it("rejects empty string", () => {
      expect(VALID_UID.test("")).toBe(false);
    });

    it("rejects 19 chars (below minimum)", () => {
      expect(VALID_UID.test("a".repeat(19))).toBe(false);
    });

    it("rejects 129 chars (above maximum)", () => {
      expect(VALID_UID.test("a".repeat(129))).toBe(false);
    });

    it("rejects path traversal", () => {
      expect(VALID_UID.test("../../../etc/passwd")).toBe(false);
    });

    it("rejects hyphens", () => {
      expect(VALID_UID.test("abcdefghij-234567890")).toBe(false);
    });

    it("rejects special characters", () => {
      expect(VALID_UID.test("abcdefghij123456789!")).toBe(false);
    });

    it("rejects spaces", () => {
      expect(VALID_UID.test(" ".repeat(20))).toBe(false);
    });

    it("rejects underscores", () => {
      expect(VALID_UID.test("abcdefghij_234567890")).toBe(false);
    });

    it("rejects newlines", () => {
      expect(VALID_UID.test("abcdefghij12345678\n0")).toBe(false);
    });

    it("rejects null bytes", () => {
      expect(VALID_UID.test("abcdefghij12345678\x000")).toBe(false);
    });

    it("rejects URL-encoded characters", () => {
      expect(VALID_UID.test("abcdefghij%2F3456789012")).toBe(false);
    });
  });
});
