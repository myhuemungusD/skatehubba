/**
 * @fileoverview Unit tests for shared Zod schemas
 * @module shared/__tests__/schema.test
 *
 * Tests validation schemas used across client and server.
 * Ensures data validation is consistent and secure.
 */

import { describe, it, expect } from "vitest";
import {
  NewSubscriberInput,
  usernameSchema,
  passwordSchema,
  paymentAmountSchema,
  sanitizedStringSchema,
  registerSchema,
  insertUserSchema,
  insertGameSchema,
  insertChallengeSchema,
} from "../schema";

// =============================================================================
// SUBSCRIBER INPUT VALIDATION
// =============================================================================

describe("NewSubscriberInput", () => {
  describe("email validation", () => {
    it("should accept valid emails", () => {
      const result = NewSubscriberInput.parse({
        email: "test@example.com",
      });
      expect(result.email).toBe("test@example.com");
    });

    it("should normalize email to lowercase", () => {
      const result = NewSubscriberInput.parse({
        email: "Test@Example.COM",
      });
      expect(result.email).toBe("test@example.com");
    });

    it("should reject email with leading/trailing whitespace (zod validates before transform)", () => {
      // Note: Zod validates email format BEFORE transform runs
      // So whitespace-padded emails are invalid. Client should trim before sending.
      expect(() => NewSubscriberInput.parse({ email: "  test@example.com  " })).toThrow();
    });

    it("should lowercase and trim valid emails", () => {
      const result = NewSubscriberInput.parse({
        email: "Test@Example.COM",
      });
      expect(result.email).toBe("test@example.com");
    });

    it("should reject invalid emails", () => {
      expect(() => NewSubscriberInput.parse({ email: "notanemail" })).toThrow();
      expect(() => NewSubscriberInput.parse({ email: "missing@tld" })).toThrow();
      expect(() => NewSubscriberInput.parse({ email: "@nodomain.com" })).toThrow();
      expect(() => NewSubscriberInput.parse({ email: "" })).toThrow();
    });
  });

  describe("firstName validation", () => {
    it("should accept valid first names", () => {
      const result = NewSubscriberInput.parse({
        email: "test@example.com",
        firstName: "Tony",
      });
      expect(result.firstName).toBe("Tony");
    });

    it("should trim whitespace from firstName", () => {
      const result = NewSubscriberInput.parse({
        email: "test@example.com",
        firstName: "  Tony  ",
      });
      expect(result.firstName).toBe("Tony");
    });

    it("should convert empty firstName to null", () => {
      const result = NewSubscriberInput.parse({
        email: "test@example.com",
        firstName: "   ",
      });
      expect(result.firstName).toBeNull();
    });

    it("should allow undefined firstName", () => {
      const result = NewSubscriberInput.parse({
        email: "test@example.com",
      });
      expect(result.firstName).toBeNull();
    });
  });

  describe("isActive validation", () => {
    it("should accept boolean isActive", () => {
      const result = NewSubscriberInput.parse({
        email: "test@example.com",
        isActive: false,
      });
      expect(result.isActive).toBe(false);
    });

    it("should allow undefined isActive", () => {
      const result = NewSubscriberInput.parse({
        email: "test@example.com",
      });
      expect(result.isActive).toBeUndefined();
    });
  });
});

// =============================================================================
// USERNAME VALIDATION
// =============================================================================

describe("usernameSchema", () => {
  it("should accept valid usernames", () => {
    expect(usernameSchema.parse("tonyhawk")).toBe("tonyhawk");
    expect(usernameSchema.parse("Sk8erBoi")).toBe("Sk8erBoi");
    expect(usernameSchema.parse("pro123")).toBe("pro123");
    expect(usernameSchema.parse("abc")).toBe("abc"); // min length
  });

  it("should reject usernames that are too short", () => {
    expect(() => usernameSchema.parse("ab")).toThrow(/at least 3 characters/);
    expect(() => usernameSchema.parse("")).toThrow();
    expect(() => usernameSchema.parse("a")).toThrow();
  });

  it("should reject usernames that are too long", () => {
    const longUsername = "a".repeat(21);
    expect(() => usernameSchema.parse(longUsername)).toThrow(/at most 20 characters/);
  });

  it("should reject usernames with invalid characters", () => {
    expect(() => usernameSchema.parse("user@name")).toThrow(/only contain/);
    expect(() => usernameSchema.parse("user name")).toThrow(/only contain/);
    expect(() => usernameSchema.parse("user.name")).toThrow(/only contain/);
    expect(() => usernameSchema.parse("user!name")).toThrow(/only contain/);
    expect(() => usernameSchema.parse("🛹skater")).toThrow(/only contain/);
    expect(() => usernameSchema.parse("user_name")).toThrow(/only contain/); // no underscores
    expect(() => usernameSchema.parse("user-name")).toThrow(/only contain/); // no hyphens
  });

  it("should accept edge case usernames", () => {
    expect(usernameSchema.parse("123")).toBe("123");
    expect(usernameSchema.parse("a".repeat(20))).toBe("a".repeat(20)); // max length
    expect(usernameSchema.parse("ABC123xyz")).toBe("ABC123xyz"); // mixed case alphanumeric
  });
});

// =============================================================================
// PASSWORD VALIDATION
// =============================================================================

describe("passwordSchema", () => {
  it("should accept valid passwords", () => {
    expect(passwordSchema.parse("Password1")).toBe("Password1");
    expect(passwordSchema.parse("Str0ngP@ss!")).toBe("Str0ngP@ss!");
    expect(passwordSchema.parse("abcDEF123")).toBe("abcDEF123");
  });

  it("should reject passwords that are too short", () => {
    expect(() => passwordSchema.parse("Pass1")).toThrow(/at least 8 characters/);
    expect(() => passwordSchema.parse("")).toThrow();
  });

  it("should reject passwords that are too long", () => {
    const longPassword = "Password1" + "x".repeat(120);
    expect(() => passwordSchema.parse(longPassword)).toThrow(/too long/);
  });

  it("should reject passwords without uppercase letters", () => {
    expect(() => passwordSchema.parse("lowercase1")).toThrow(/uppercase/);
  });

  it("should reject passwords without lowercase letters", () => {
    expect(() => passwordSchema.parse("UPPERCASE1")).toThrow(/lowercase/);
  });

  it("should reject passwords without numbers", () => {
    expect(() => passwordSchema.parse("NoNumbers!")).toThrow(/number/);
  });

  it("should accept passwords with special characters", () => {
    expect(passwordSchema.parse("P@$$w0rd!!")).toBe("P@$$w0rd!!");
    expect(passwordSchema.parse("Secure#123")).toBe("Secure#123");
  });
});

// =============================================================================
// AUTH USER SCHEMAS
// =============================================================================

describe("registerSchema", () => {
  it("accepts valid registration data", () => {
    const result = registerSchema.safeParse({
      email: "skater@example.com",
      password: "StrongPass1",
      firstName: "Tony",
      lastName: "Hawk",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email formats", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "StrongPass1",
      firstName: "Tony",
      lastName: "Hawk",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("valid email");
    }
  });
});

describe("insertUserSchema", () => {
  it("accepts valid username/password payloads", () => {
    const result = insertUserSchema.safeParse({
      username: "SkatePro99",
      password: "StrongPass1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects usernames outside length constraints", () => {
    const tooShort = insertUserSchema.safeParse({
      username: "ab",
      password: "StrongPass1",
    });
    const tooLong = insertUserSchema.safeParse({
      username: "a".repeat(21),
      password: "StrongPass1",
    });
    expect(tooShort.success).toBe(false);
    expect(tooLong.success).toBe(false);
  });
});

// =============================================================================
// GAME / CHALLENGE SCHEMAS
// =============================================================================

describe("insertGameSchema", () => {
  it("accepts valid game payloads", () => {
    const result = insertGameSchema.safeParse({
      player1Id: "player-1",
      player1Name: "Player One",
      status: "waiting",
    });
    expect(result.success).toBe(true);
  });

  it("allows optional fields to be omitted", () => {
    const result = insertGameSchema.safeParse({
      player1Id: "player-1",
      player1Name: "Player One",
      status: "active",
      player2Id: undefined,
      player2Name: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status values", () => {
    const result = insertGameSchema.safeParse({
      player1Id: "player-1",
      player1Name: "Player One",
      status: "x".repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

describe("insertChallengeSchema", () => {
  it("accepts valid challenge payloads", () => {
    const result = insertChallengeSchema.safeParse({
      challengerId: "challenger-1",
      challengedId: "challenged-1",
      status: "pending",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid challenge status values", () => {
    const result = insertChallengeSchema.safeParse({
      challengerId: "challenger-1",
      challengedId: "challenged-1",
      status: "x".repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// PAYMENT AMOUNT VALIDATION
// =============================================================================

describe("paymentAmountSchema", () => {
  it("should accept valid payment amounts", () => {
    expect(paymentAmountSchema.parse(0.5)).toBe(0.5);
    expect(paymentAmountSchema.parse(10)).toBe(10);
    expect(paymentAmountSchema.parse(99.99)).toBe(99.99);
    expect(paymentAmountSchema.parse(10000)).toBe(10000);
  });

  it("should reject amounts below minimum", () => {
    expect(() => paymentAmountSchema.parse(0.49)).toThrow(/at least \$0\.50/);
    expect(() => paymentAmountSchema.parse(0)).toThrow();
    expect(() => paymentAmountSchema.parse(-1)).toThrow();
  });

  it("should reject amounts above maximum", () => {
    expect(() => paymentAmountSchema.parse(10001)).toThrow(/cannot exceed \$10,000/);
    expect(() => paymentAmountSchema.parse(100000)).toThrow();
  });

  it("should handle decimal precision", () => {
    expect(paymentAmountSchema.parse(19.99)).toBe(19.99);
    expect(paymentAmountSchema.parse(0.5)).toBe(0.5);
  });
});

// =============================================================================
// SANITIZED STRING VALIDATION
// =============================================================================

describe("sanitizedStringSchema", () => {
  it("should accept valid strings", () => {
    expect(sanitizedStringSchema.parse("Hello World")).toBe("Hello World");
    expect(sanitizedStringSchema.parse("Just a normal string")).toBe("Just a normal string");
  });

  it("should trim whitespace", () => {
    expect(sanitizedStringSchema.parse("  trimmed  ")).toBe("trimmed");
  });

  it("should reject strings with HTML tags (XSS prevention)", () => {
    expect(() => sanitizedStringSchema.parse('<script>alert("xss")</script>')).toThrow(/HTML/);
    expect(() => sanitizedStringSchema.parse('<img src="x" onerror="alert(1)">')).toThrow(/HTML/);
    expect(() => sanitizedStringSchema.parse("Hello <b>world</b>")).toThrow(/HTML/);
  });

  it("should reject strings with partial HTML", () => {
    expect(() => sanitizedStringSchema.parse("test < value")).toThrow(/HTML/);
    expect(() => sanitizedStringSchema.parse("value > test")).toThrow(/HTML/);
  });

  it("should reject strings that are too long", () => {
    const longString = "x".repeat(1001);
    expect(() => sanitizedStringSchema.parse(longString)).toThrow(/too long/);
  });

  it("should accept strings at max length", () => {
    const maxString = "x".repeat(1000);
    expect(sanitizedStringSchema.parse(maxString)).toBe(maxString);
  });

  it("should allow special characters (except HTML)", () => {
    expect(sanitizedStringSchema.parse("Hello! @#$%^&*()")).toBe("Hello! @#$%^&*()");
    expect(sanitizedStringSchema.parse("🛹 Skateboarding")).toBe("🛹 Skateboarding");
  });
});
