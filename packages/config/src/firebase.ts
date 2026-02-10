/**
 * Firebase Configuration
 *
 * Centralized Firebase config that works for both web and mobile.
 * Uses environment-based app separation within a single Firebase project.
 *
 * @module @skatehubba/config/firebase
 */

import { getPublicEnvOptional, getAppEnv, type AppEnv } from "./publicEnv";

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
  const apiKey = normalizeEnvValue(getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_API_KEY"));
  const projectId = normalizeEnvValue(getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_PROJECT_ID"));
  const appId = normalizeEnvValue(getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID"));

  if (!apiKey || !projectId || !appId) return null;

  const authDomain =
    normalizeEnvValue(getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN")) ||
    `${projectId}.firebaseapp.com`;

  const storageBucket =
    normalizeEnvValue(getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET")) ||
    `${projectId}.firebasestorage.app`;

  const messagingSenderId =
    normalizeEnvValue(getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID")) || "";

  const measurementId = normalizeEnvValue(
    getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID"),
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
 * Get Firebase config for the current environment.
 *
 * All values are read from environment variables. If the required variables
 * (API key, project ID, app ID) are missing the function throws so that
 * misconfigurations are caught immediately rather than silently falling back
 * to stale hardcoded credentials.
 */
export function getFirebaseConfig(_options: GetFirebaseConfigOptions = {}): FirebaseConfig {
  const env = getAppEnv();
  const config = buildConfigFromEnv();

  if (config) {
    console.log(`[Firebase] Using env-provided config for ${env}`);
    return config;
  }

  const missing = REQUIRED_FIREBASE_VARS.filter((v) => !getPublicEnvOptional(v));
  throw new Error(
    `[Firebase] Missing required environment variables: ${missing.join(", ")}. ` +
      `Set these in your .env file or deployment environment. See .env.example for reference.`
  );
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
      return getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_PROD") || "";
    case "staging":
      return getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_STAGING") || "";
    default:
      return getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID") || "";
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
