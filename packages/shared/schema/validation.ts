import { z } from "zod";

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9]+$/, "Username can only contain letters and numbers");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password too long")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number"
  );

export const paymentAmountSchema = z
  .number()
  .min(0.5, "Amount must be at least $0.50")
  .max(10000, "Amount cannot exceed $10,000");

export const sanitizedStringSchema = z
  .string()
  .trim()
  .max(1000, "String too long")
  // CodeQL: Bad HTML filtering regex / polynomial regex on uncontrolled data
  .refine((str) => !str.includes("<") && !str.includes(">"), "HTML is not allowed");
