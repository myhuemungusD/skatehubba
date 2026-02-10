import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export type SignInForm = z.infer<typeof signInSchema>;
export type SignUpForm = z.infer<typeof signUpSchema>;

/**
 * Detect if running in an embedded browser (Instagram, Facebook, etc.)
 * Google blocks OAuth in these webviews for security reasons
 */
export function isEmbeddedBrowser(): boolean {
  const ua = navigator.userAgent || navigator.vendor || "";
  return (
    ua.includes("FBAN") ||
    ua.includes("FBAV") ||
    ua.includes("Instagram") ||
    ua.includes("Twitter") ||
    ua.includes("Line/") ||
    ua.includes("KAKAOTALK") ||
    ua.includes("Snapchat") ||
    ua.includes("TikTok") ||
    (ua.includes("wv") && ua.includes("Android"))
  );
}
