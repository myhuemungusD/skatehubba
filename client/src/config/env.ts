import { z } from "zod";

/**
 * Client-side env schema.
 *
 * Every EXPO_PUBLIC_* var the web client reads MUST be declared here.
 * This is the compile-time enforcement layer — if a var isn't listed,
 * TypeScript and Zod will reject it.
 *
 * For the canonical list of all EXPO_PUBLIC_ vars across the monorepo,
 * see packages/config/src/envContract.ts.
 */
const envSchema = z.object({
  // ── Vite built-ins ──
  MODE: z.string().default("development"),
  DEV: z.boolean().default(true),
  PROD: z.boolean().default(false),

  // ── Firebase ──
  EXPO_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),
  EXPO_PUBLIC_RECAPTCHA_SITE_KEY: z.string().optional(),

  // ── App config ──
  EXPO_PUBLIC_APP_ENV: z.string().optional(),

  // ── Payments & donations ──
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  EXPO_PUBLIC_DONATE_STRIPE_URL: z.string().optional(),
  EXPO_PUBLIC_DONATE_PAYPAL_URL: z.string().optional(),

  // ── Monitoring ──
  EXPO_PUBLIC_SENTRY_DSN: z.string().optional(),

  // ── Build stamps (set by CI, optional for local dev) ──
  EXPO_PUBLIC_COMMIT_SHA: z.string().optional(),
  EXPO_PUBLIC_BUILD_TIME: z.string().optional(),

  // ── E2E testing ──
  EXPO_PUBLIC_E2E: z.string().optional(),
});

function validateEnv() {
  try {
    const parsed = envSchema.parse(import.meta.env);

    // H10: Validate critical Firebase config — fail fast in production without console leaks
    if (import.meta.env.PROD) {
      if (
        !parsed.EXPO_PUBLIC_FIREBASE_API_KEY ||
        parsed.EXPO_PUBLIC_FIREBASE_API_KEY === "undefined"
      ) {
        throw new Error("Critical client configuration missing. Cannot start application.");
      }
      if (
        !parsed.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
        parsed.EXPO_PUBLIC_FIREBASE_PROJECT_ID === "undefined"
      ) {
        throw new Error("Critical client configuration missing. Cannot start application.");
      }
    }

    return parsed;
  } catch (error) {
    if (import.meta.env.PROD) {
      // H10: Don't leak validation details to browser console in production
      throw new Error("Application configuration error.");
    }
    // Development fallback only
    console.warn("[ENV] Using fallback empty env for development");
    if (import.meta.env.DEV) {
      console.error("[ENV] Validation failed:", error);
    }
    return envSchema.parse({});
  }
}

export const env = validateEnv();
