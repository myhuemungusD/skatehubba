import { describe, it, expect } from "vitest";

/**
 * Validates the VALID_CHALLENGE_ID regex used in challenge/[id].tsx for deep link
 * parameter validation. Firestore auto-generated IDs are exactly 20
 * alphanumeric characters.
 */
const VALID_CHALLENGE_ID = /^[a-zA-Z0-9]{20}$/;

describe("VALID_CHALLENGE_ID regex", () => {
  describe("accepts valid Firestore IDs", () => {
    it("accepts 20 lowercase alphanumeric chars", () => {
      expect(VALID_CHALLENGE_ID.test("abcdefghij1234567890")).toBe(true);
    });

    it("accepts 20 uppercase alphanumeric chars", () => {
      expect(VALID_CHALLENGE_ID.test("ABCDEFGHIJ1234567890")).toBe(true);
    });

    it("accepts mixed case", () => {
      expect(VALID_CHALLENGE_ID.test("AbCdEfGhIj1234567890")).toBe(true);
    });

    it("accepts all digits", () => {
      expect(VALID_CHALLENGE_ID.test("12345678901234567890")).toBe(true);
    });

    it("accepts all letters", () => {
      expect(VALID_CHALLENGE_ID.test("abcdefghijklmnopqrst")).toBe(true);
    });
  });

  describe("rejects invalid inputs", () => {
    it("rejects empty string", () => {
      expect(VALID_CHALLENGE_ID.test("")).toBe(false);
    });

    it("rejects too short", () => {
      expect(VALID_CHALLENGE_ID.test("short")).toBe(false);
    });

    it("rejects 19 chars (off by one)", () => {
      expect(VALID_CHALLENGE_ID.test("a".repeat(19))).toBe(false);
    });

    it("rejects 21 chars (off by one)", () => {
      expect(VALID_CHALLENGE_ID.test("a".repeat(21))).toBe(false);
    });

    it("rejects path traversal", () => {
      expect(VALID_CHALLENGE_ID.test("../../../etc/passwd")).toBe(false);
    });

    it("rejects hyphens (UUID format)", () => {
      expect(VALID_CHALLENGE_ID.test("abc-def-ghi-12345678")).toBe(false);
    });

    it("rejects special characters", () => {
      expect(VALID_CHALLENGE_ID.test("abcdefghij123456789!")).toBe(false);
    });

    it("rejects spaces", () => {
      expect(VALID_CHALLENGE_ID.test(" ".repeat(20))).toBe(false);
    });

    it("rejects underscores", () => {
      expect(VALID_CHALLENGE_ID.test("abcdefghij_234567890")).toBe(false);
    });

    it("rejects newlines", () => {
      expect(VALID_CHALLENGE_ID.test("abcdefghij12345678\n0")).toBe(false);
    });

    it("rejects null bytes", () => {
      expect(VALID_CHALLENGE_ID.test("abcdefghij12345678\x000")).toBe(false);
    });

    it("rejects URL-encoded characters", () => {
      expect(VALID_CHALLENGE_ID.test("abcdefghij%2F345678")).toBe(false);
    });
  });
});
