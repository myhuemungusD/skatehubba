/**
 * Tests for client/src/lib/validation/betaSignup.ts
 *
 * The client module re-exports the BetaSignupInput Zod schema from
 * @shared/validation/betaSignup. We test the validation behaviour
 * through the client's re-export.
 */

import { describe, it, expect } from "vitest";
import { BetaSignupInput } from "../../validation/betaSignup";

describe("BetaSignupInput validation schema", () => {
  // ────────────────────────────────────────────────────────────────────────
  // Valid inputs
  // ────────────────────────────────────────────────────────────────────────

  describe("valid inputs", () => {
    it("accepts valid email + ios platform", () => {
      const result = BetaSignupInput.safeParse({
        email: "user@skatehubba.com",
        platform: "ios",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@skatehubba.com");
        expect(result.data.platform).toBe("ios");
      }
    });

    it("accepts valid email + android platform", () => {
      const result = BetaSignupInput.safeParse({
        email: "user@skatehubba.com",
        platform: "android",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platform).toBe("android");
      }
    });

    it("trims whitespace from email", () => {
      const result = BetaSignupInput.safeParse({
        email: "  user@example.com  ",
        platform: "ios",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
      }
    });

    it("lowercases the email", () => {
      const result = BetaSignupInput.safeParse({
        email: "User@Example.COM",
        platform: "ios",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
      }
    });

    it("trims and lowercases together", () => {
      const result = BetaSignupInput.safeParse({
        email: "  SKATER@Gmail.COM  ",
        platform: "android",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("skater@gmail.com");
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Invalid emails
  // ────────────────────────────────────────────────────────────────────────

  describe("invalid email", () => {
    it("rejects missing email", () => {
      const result = BetaSignupInput.safeParse({ platform: "ios" });
      expect(result.success).toBe(false);
    });

    it("rejects empty email", () => {
      const result = BetaSignupInput.safeParse({ email: "", platform: "ios" });
      expect(result.success).toBe(false);
    });

    it("rejects email without @ symbol", () => {
      const result = BetaSignupInput.safeParse({
        email: "not-an-email",
        platform: "ios",
      });
      expect(result.success).toBe(false);
    });

    it("rejects email without domain", () => {
      const result = BetaSignupInput.safeParse({
        email: "user@",
        platform: "ios",
      });
      expect(result.success).toBe(false);
    });

    it("rejects email without local part", () => {
      const result = BetaSignupInput.safeParse({
        email: "@example.com",
        platform: "ios",
      });
      expect(result.success).toBe(false);
    });

    it("returns a user-friendly error message for invalid email", () => {
      const result = BetaSignupInput.safeParse({
        email: "bad",
        platform: "ios",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const emailError = result.error.issues.find((issue) => issue.path[0] === "email");
        expect(emailError).toBeDefined();
        expect(emailError!.message).toBe("Enter a valid email");
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Invalid platform
  // ────────────────────────────────────────────────────────────────────────

  describe("invalid platform", () => {
    it("rejects missing platform", () => {
      const result = BetaSignupInput.safeParse({
        email: "user@example.com",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unsupported platform", () => {
      const result = BetaSignupInput.safeParse({
        email: "user@example.com",
        platform: "windows",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty platform", () => {
      const result = BetaSignupInput.safeParse({
        email: "user@example.com",
        platform: "",
      });
      expect(result.success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Strict mode (no extra fields)
  // ────────────────────────────────────────────────────────────────────────

  describe("strict mode", () => {
    it("rejects extra / unknown fields", () => {
      const result = BetaSignupInput.safeParse({
        email: "user@example.com",
        platform: "ios",
        extraField: "should fail",
      });

      expect(result.success).toBe(false);
    });

    it("rejects when both valid fields and extra fields are present", () => {
      const result = BetaSignupInput.safeParse({
        email: "user@example.com",
        platform: "android",
        referral: "friend",
        coupon: "SKATE100",
      });

      expect(result.success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ────────────────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("rejects null input", () => {
      const result = BetaSignupInput.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("rejects undefined input", () => {
      const result = BetaSignupInput.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it("rejects empty object", () => {
      const result = BetaSignupInput.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects non-object input", () => {
      const result = BetaSignupInput.safeParse("not-an-object");
      expect(result.success).toBe(false);
    });

    it("rejects numeric email", () => {
      const result = BetaSignupInput.safeParse({
        email: 12345,
        platform: "ios",
      });
      expect(result.success).toBe(false);
    });
  });
});
