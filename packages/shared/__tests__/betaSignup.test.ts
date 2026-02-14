/**
 * Tests for packages/shared/validation/betaSignup.ts
 *
 * Covers: BetaSignupInput Zod schema validation and type export.
 */

import { BetaSignupInput } from "../validation/betaSignup";

describe("BetaSignupInput", () => {
  it("accepts valid iOS signup", () => {
    const result = BetaSignupInput.safeParse({
      email: "skater@example.com",
      platform: "ios",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("skater@example.com");
      expect(result.data.platform).toBe("ios");
    }
  });

  it("accepts valid Android signup", () => {
    const result = BetaSignupInput.safeParse({
      email: "rider@example.com",
      platform: "android",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.platform).toBe("android");
    }
  });

  it("normalizes email to lowercase", () => {
    const result = BetaSignupInput.safeParse({
      email: "Skater@Example.COM",
      platform: "ios",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("skater@example.com");
    }
  });

  it("trims whitespace from email", () => {
    const result = BetaSignupInput.safeParse({
      email: "  skater@example.com  ",
      platform: "android",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("skater@example.com");
    }
  });

  it("rejects invalid email", () => {
    const result = BetaSignupInput.safeParse({
      email: "not-an-email",
      platform: "ios",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("valid email");
    }
  });

  it("rejects empty email", () => {
    const result = BetaSignupInput.safeParse({
      email: "",
      platform: "ios",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = BetaSignupInput.safeParse({
      platform: "ios",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid platform", () => {
    const result = BetaSignupInput.safeParse({
      email: "skater@example.com",
      platform: "windows",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing platform", () => {
    const result = BetaSignupInput.safeParse({
      email: "skater@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict mode)", () => {
    const result = BetaSignupInput.safeParse({
      email: "skater@example.com",
      platform: "ios",
      extraField: "not-allowed",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = BetaSignupInput.safeParse({});
    expect(result.success).toBe(false);
  });
});
