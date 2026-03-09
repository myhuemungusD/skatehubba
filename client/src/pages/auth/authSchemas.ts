import { z } from "zod";
import { usernameSchema } from "@shared/validation/profile";

export const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const MIN_AGE = 13;

const dobSchema = z
  .string()
  .min(1, "Date of birth is required")
  .refine(
    (val) => {
      const dob = new Date(val);
      if (isNaN(dob.getTime())) return false;
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      const dayDiff = today.getDate() - dob.getDate();
      const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
      return actualAge >= MIN_AGE;
    },
    { message: `You must be at least ${MIN_AGE} years old to use SkateHubba` }
  );

export const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  dob: dobSchema,
  username: usernameSchema,
  stance: z.enum(["regular", "goofy"]).optional().or(z.literal("")),
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
