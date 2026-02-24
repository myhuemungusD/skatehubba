/**
 * Environment Variable Contract
 *
 * Single source of truth for ALL public environment variable names used across
 * the monorepo. Import this contract in schemas, validation scripts, and type
 * declarations to guarantee that every consumer agrees on the canonical names.
 *
 * Rules:
 * 1. All client-facing env vars MUST use the EXPO_PUBLIC_ prefix.
 *    This is the canonical prefix that works across Vite (web), Expo (mobile),
 *    and Node.js (server/scripts).
 *
 * 2. VITE_ prefix is reserved for Vite build-tool configuration
 *    (e.g. VITE_SOURCEMAP, VITE_API_PROXY_TARGET). These are consumed by
 *    vite.config.ts only and are NEVER bundled into application code.
 *
 * 3. Unprefixed vars (DATABASE_URL, JWT_SECRET, etc.) are server-only secrets.
 *    They must NEVER appear in client code or be exposed via envPrefix.
 *
 * Adding a new env var? Add it here first, then update:
 * - .env.example (documentation)
 * - client/src/config/env.ts (client zod schema)
 * - client/src/vite-env.d.ts (TypeScript declarations)
 * - scripts/verify-public-env.mjs (if required for builds)
 *
 * @module @skatehubba/config/envContract
 */

// ============================================================================
// Required public env vars — builds FAIL without these
// ============================================================================

export const REQUIRED_PUBLIC_VARS = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

// ============================================================================
// Optional public env vars — app runs without these, with defaults
// ============================================================================

export const OPTIONAL_PUBLIC_VARS = [
  // Firebase
  "EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID_PROD",
  "EXPO_PUBLIC_FIREBASE_APP_ID_STAGING",
  "EXPO_PUBLIC_RECAPTCHA_SITE_KEY",
  "EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN",

  // App config
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_CANONICAL_ORIGIN",
  "EXPO_PUBLIC_APP_VERSION",
  "EXPO_PUBLIC_DEBUG",

  // Stripe & donations
  "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_DONATE_STRIPE_URL",
  "EXPO_PUBLIC_DONATE_PAYPAL_URL",

  // Monitoring
  "EXPO_PUBLIC_SENTRY_DSN",

  // Feature flags
  "EXPO_PUBLIC_ENABLE_ANALYTICS",
  "EXPO_PUBLIC_ENABLE_SENTRY",
  "EXPO_PUBLIC_ENABLE_STRIPE",

  // Build stamps (set by CI)
  "EXPO_PUBLIC_COMMIT_SHA",
  "EXPO_PUBLIC_BUILD_TIME",

  // E2E testing
  "EXPO_PUBLIC_E2E",

  // Google OAuth (mobile)
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
] as const;

// ============================================================================
// Derived types
// ============================================================================

export type RequiredPublicVar = (typeof REQUIRED_PUBLIC_VARS)[number];
export type OptionalPublicVar = (typeof OPTIONAL_PUBLIC_VARS)[number];
export type PublicVar = RequiredPublicVar | OptionalPublicVar;

/** All known EXPO_PUBLIC_ var names */
export const ALL_PUBLIC_VARS = [...REQUIRED_PUBLIC_VARS, ...OPTIONAL_PUBLIC_VARS] as const;

// ============================================================================
// Prefix validation helpers
// ============================================================================

const EXPO_PREFIX = "EXPO_PUBLIC_";

/**
 * Check if a variable name uses the canonical EXPO_PUBLIC_ prefix.
 * Use this in CI scripts and linters to catch stale VITE_ references.
 */
export function isCanonicalPrefix(name: string): boolean {
  return name.startsWith(EXPO_PREFIX);
}

/**
 * Detect if a variable name uses a legacy or wrong prefix.
 * Returns the expected canonical name, or null if the name is not recognized.
 */
export function detectPrefixMismatch(
  name: string
): { expected: string; prefix: "VITE_" | "NEXT_PUBLIC_" | "REACT_APP_" } | null {
  const legacyPrefixes = ["VITE_", "NEXT_PUBLIC_", "REACT_APP_"] as const;

  for (const prefix of legacyPrefixes) {
    if (name.startsWith(prefix)) {
      const base = name.slice(prefix.length);
      const expected = `${EXPO_PREFIX}${base}`;
      // Only flag it if the canonical version exists in our contract
      if ((ALL_PUBLIC_VARS as readonly string[]).includes(expected)) {
        return { expected, prefix };
      }
    }
  }
  return null;
}

/**
 * Validate that no EXPO_PUBLIC_ vars in the contract are missing from
 * the provided env record. Returns the list of missing required vars.
 */
export function validatePublicEnv(env: Record<string, string | undefined>): {
  missing: RequiredPublicVar[];
  mismatched: Array<{ found: string; expected: string }>;
} {
  const missing = REQUIRED_PUBLIC_VARS.filter((name) => {
    const val = env[name];
    return !val || val.trim() === "";
  }) as unknown as RequiredPublicVar[];

  // Check for vars set with wrong prefix
  const mismatched: Array<{ found: string; expected: string }> = [];
  for (const key of Object.keys(env)) {
    const mismatch = detectPrefixMismatch(key);
    if (mismatch) {
      mismatched.push({ found: key, expected: mismatch.expected });
    }
  }

  return { missing, mismatched };
}
