/**
 * Firebase Configuration
 *
 * Centralized Firebase config that works for both web and mobile.
 * Uses environment-based app separation within a single Firebase project.
 *
 * @module @skatehubba/config/firebase
 */

import { getEnvOptional, getAppEnv, type AppEnv } from "./env";
import { globals } from "./globals";

/**
 * Firebase configuration interface
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export interface GetFirebaseConfigOptions {
  allowLocalFallback?: boolean;
}

/**
 * Required Firebase environment variables.
 *
 * Security model:
 * - Firebase Web API keys are not traditional secrets; security is enforced via
 *   Firebase Security Rules and authorized domains (see AUTHORIZED_DOMAINS below).
 * - We still read all values from environment variables so credentials can be
 *   rotated without code changes and are never committed to source control.
 *
 * All EXPO_PUBLIC_FIREBASE_* vars must be configured in the deployment
 * environment. The app will throw at startup if they are missing.
 */
const REQUIRED_FIREBASE_VARS = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
] as const;

function normalizeEnvValue(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null") {
    return undefined;
  }
  return value;
}

function buildConfigFromEnv(): FirebaseConfig | null {
  const apiKey = normalizeEnvValue(getEnvOptional("EXPO_PUBLIC_FIREBASE_API_KEY"));
  const projectId = normalizeEnvValue(getEnvOptional("EXPO_PUBLIC_FIREBASE_PROJECT_ID"));
  const appId = normalizeEnvValue(getEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID"));

  if (!apiKey || !projectId || !appId) return null;

  const authDomain =
    normalizeEnvValue(getEnvOptional("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN")) ||
    `${projectId}.firebaseapp.com`;

  const storageBucket =
    normalizeEnvValue(getEnvOptional("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET")) ||
    `${projectId}.firebasestorage.app`;

  const messagingSenderId =
    normalizeEnvValue(getEnvOptional("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID")) || "";

  const measurementId = normalizeEnvValue(
    getEnvOptional("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID")
  );

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId,
  };
}

/**
 * Detect CI / build environments where Firebase is never actually called.
 *
 * Vercel sets CI=1 during builds; GitHub Actions sets CI=true.
 * Vitest sets VITEST=true. We also check NODE_ENV=test.
 *
 * At *runtime* on Vercel (serverless / edge) CI is NOT set, so a missing
 * config will still hard-fail there.
 */
function isBuildOrTest(): boolean {
  try {
    const env = globals.process?.env;
    if (!env) return false;
    return env.CI === "true" || env.CI === "1" || env.VITEST === "true" || env.NODE_ENV === "test";
  } catch {
    return false;
  }
}

/**
 * Placeholder config returned during CI / build when env vars are missing.
 * Firebase SDK will never be called during builds, so these values are inert.
 */
const CI_PLACEHOLDER_CONFIG: FirebaseConfig = {
  apiKey: "CI_PLACEHOLDER",
  authDomain: "placeholder.firebaseapp.com",
  projectId: "ci-placeholder",
  storageBucket: "ci-placeholder.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:placeholder",
};

/**
 * Get Firebase config for the current environment.
 *
 * All values are read from environment variables. If the required variables
 * (API key, project ID, app ID) are missing:
 * - During CI / build / test: returns a placeholder config with a warning
 *   so builds and tests don't crash on modules that transitively import this.
 * - At runtime: throws so misconfigurations are caught immediately rather
 *   than silently falling back to stale hardcoded credentials.
 */
export function getFirebaseConfig(_options: GetFirebaseConfigOptions = {}): FirebaseConfig {
  const env = getAppEnv();
  const config = buildConfigFromEnv();

  if (config) {
    console.log(`[Firebase] Using env-provided config for ${env}`);
    return config;
  }

  const missing = REQUIRED_FIREBASE_VARS.filter((v) => !getEnvOptional(v));
  const message =
    `[Firebase] Missing required environment variables: ${missing.join(", ")}. ` +
    `Set these in your .env file or deployment environment. See .env.example for reference.`;

  // During CI / build / test, warn but don't crash — Firebase is never
  // actually initialised during these steps.
  if (isBuildOrTest()) {
    console.warn(message + " (using CI placeholder config)");
    return CI_PLACEHOLDER_CONFIG;
  }

  throw new Error(message);
}

/**
 * Get the expected Firebase App ID for an environment.
 *
 * Returns the env-var value, or empty string when unset. Callers can use
 * this helper to implement environment-specific validation or guardrails.
 */
export function getExpectedAppId(env: AppEnv): string {
  switch (env) {
    case "prod":
      return getEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_PROD") || "";
    case "staging":
      return getEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_STAGING") || "";
    default:
      return getEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID") || "";
  }
}

/**
 * Authorized domains for Firebase Auth (for reference)
 *
 * Configure these in Firebase Console > Authentication > Settings > Authorized domains
 *
 * Production:
 * - skatehubba.com
 * - www.skatehubba.com
 * - api.skatehubba.com
 *
 * Staging:
 * - staging.skatehubba.com
 * - staging-api.skatehubba.com
 *
 * DO NOT ADD:
 * - *.vercel.app (preview URLs)
 * - localhost (only for development)
 */
export const AUTHORIZED_DOMAINS = {
  prod: ["skatehubba.com", "www.skatehubba.com", "api.skatehubba.com"],
  staging: ["staging.skatehubba.com", "staging-api.skatehubba.com"],
  local: ["localhost"],
} as const;
