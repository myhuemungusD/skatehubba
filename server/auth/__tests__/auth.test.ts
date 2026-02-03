/**
 * @fileoverview Integration-style validation tests for auth schemas.
 * @module server/auth/__tests__/auth.test
 *
 * Focuses on Zod validation logic defined in shared/schema.ts.
 */

import { describe, expect, it } from "vitest";
import { insertUserSchema, loginSchema, registerSchema } from "../../../packages/shared/schema";

describe("auth schema validation", () => {
  describe("signup validation", () => {
    it("accepts valid signup data", () => {
      const result = registerSchema.safeParse({
        email: "skater@example.com",
        password: "SkatePass1",
        firstName: "Tony",
        lastName: "Hawk",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("skater@example.com");
      }
    });

    it("rejects invalid email", () => {
      const result = registerSchema.safeParse({
        email: "not-an-email",
        password: "SkatePass1",
        firstName: "Tony",
        lastName: "Hawk",
      });

      expect(result.success).toBe(false);
    });

    it("rejects weak password", () => {
      const result = registerSchema.safeParse({
        email: "skater@example.com",
        password: "weakpass",
        firstName: "Tony",
        lastName: "Hawk",
      });

      expect(result.success).toBe(false);
    });

    it("rejects missing required fields", () => {
      const result = registerSchema.safeParse({
        email: "skater@example.com",
        password: "SkatePass1",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("login flow", () => {
    it("accepts valid credentials structure", () => {
      const result = loginSchema.safeParse({
        email: "skater@example.com",
        password: "SkatePass1",
      });

      expect(result.success).toBe(true);
    });

    it("validates email format", () => {
      const result = loginSchema.safeParse({
        email: "skater-at-example.com",
        password: "SkatePass1",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("schema validation", () => {
    it("accepts valid user data", () => {
      const result = insertUserSchema.safeParse({
        username: "SkateKing",
        password: "SkatePass1",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.username).toBe("SkateKing");
      }
    });

    it("rejects invalid user data", () => {
      const result = insertUserSchema.safeParse({
        username: "x",
        password: "weakpass",
      });

      expect(result.success).toBe(false);
    });

    it("drops protected fields from user payload", () => {
      const result = insertUserSchema.safeParse({
        username: "SkateKing",
        password: "SkatePass1",
        trustLevel: 2,
        reputationScore: 9001,
        isBanned: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("trustLevel");
        expect(result.data).not.toHaveProperty("reputationScore");
        expect(result.data).not.toHaveProperty("isBanned");
      }
    });
  });
});
