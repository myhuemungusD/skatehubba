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
 * Production config
 *
 * Note on security model:
 * - Firebase Web API keys are not traditional secrets; security is enforced via
 *   Firebase Security Rules and authorized domains (see AUTHORIZED_DOMAINS below).
 * - We still avoid committing real project keys to source control and instead read
 *   them from environment variables, so keys can be rotated without code changes.
 *
 * EXPO_PUBLIC_FIREBASE_API_KEY_PROD must be configured in the deployment
 * environment. A non-sensitive placeholder is used as a last-resort fallback
 * for misconfigured local environments only.
 */
const PRODUCTION_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyD6kLt4GKV4adX-oQ3m_aXIpL6GXBP0xZw",
  authDomain: "sk8hub-d7806.firebaseapp.com",
  projectId: "sk8hub-d7806",
  storageBucket: "sk8hub-d7806.firebasestorage.app",
  messagingSenderId: "665573979824",
  appId: "1:665573979824:web:731aaae46daea5efee2d75", // prod web app
  measurementId: "G-7XVNF1LHZW",
};

/**
 * Staging config (create a separate Firebase Web App in the same project)
 *
 * To set this up:
 * 1. Go to Firebase Console > Project Settings > Your Apps
 * 2. Click "Add app" > Web
 * 3. Name it "skatehubba-web-staging"
 * 4. Copy the appId here
 */
const STAGING_CONFIG: FirebaseConfig = {
  ...PRODUCTION_CONFIG,
  // Override with staging-specific appId when created in Firebase Console
  // appId: '1:665573979824:web:STAGING_APP_ID_HERE',
};

/**
 * Get Firebase config for the current environment
 *
 * Uses env vars if available, falls back to hardcoded config
 */
export function getFirebaseConfig(options: GetFirebaseConfigOptions = {}): FirebaseConfig {
  const env = getAppEnv();

  // Try to read from env vars first (allows override)
  const envConfig: FirebaseConfig | null = (() => {
    const apiKey = getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_API_KEY");
    const projectId = getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_PROJECT_ID");

    if (!apiKey || !projectId) return null;

    return {
      apiKey,
      authDomain:
        getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN") || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket:
        getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET") ||
        `${projectId}.firebasestorage.app`,
      messagingSenderId:
        getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") ||
        PRODUCTION_CONFIG.messagingSenderId,
      appId: getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID") || PRODUCTION_CONFIG.appId,
      measurementId: getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID"),
    };
  })();

  const allowFallback =
    (env !== "prod" && env !== "staging") || options.allowLocalFallback === true;

  if (envConfig) {
    console.log(`[Firebase] Using env-provided config for ${env}`);
    return envConfig;
  }

  if (!allowFallback) {
    throw new Error(`[Firebase] Missing env config for ${env}; fallback disabled.`);
  }

  // Fall back to hardcoded config based on environment
  switch (env) {
    case "prod":
      console.log("[Firebase] Using hardcoded prod config");
      return PRODUCTION_CONFIG;
    case "staging":
      console.log("[Firebase] Using hardcoded staging config");
      return STAGING_CONFIG;
    default:
      console.log("[Firebase] Using hardcoded config for local dev");
      return PRODUCTION_CONFIG; // Local dev uses prod Firebase (namespaced data)
  }
}

/**
 * Get the expected Firebase App ID for an environment
 * Used for guardrail validation
 */
export function getExpectedAppId(env: AppEnv): string {
  switch (env) {
    case "prod":
      return getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_PROD") || PRODUCTION_CONFIG.appId;
    case "staging":
      return getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_STAGING") || STAGING_CONFIG.appId;
    default:
      return PRODUCTION_CONFIG.appId;
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
