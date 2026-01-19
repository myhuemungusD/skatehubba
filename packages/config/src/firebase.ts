/**
 * Firebase Configuration
 *
 * Centralized Firebase config for web + mobile.
 * Environment-aware selection while remaining within a single Firebase project.
 *
 * Design goals:
 * - Deterministic: env var overrides are explicit and validated.
 * - Safe-by-default: production/staging must be correctly configured (fail fast).
 * - No secret assumptions: web API keys are not secrets; security via rules + auth domains.
 * - Enterprise hygiene: no noisy console logs, no silent fallbacks in high environments.
 *
 * @module @skatehubba/config/firebase
 */

import { getPublicEnvOptional, getAppEnv, type AppEnv } from "./publicEnv";

/**
 * Minimal logger contract (avoid direct console usage).
 * Consumers can wire this to pino/winston/datadog/etc.
 */
type LogFn = (msg: string, meta?: Record<string, unknown>) => void;
const noop: LogFn = () => undefined;

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

/**
 * Hardcoded baseline config for this Firebase project.
 * NOTE: This is not "secret"; it is a safe default for local development only.
 *
 * Production/staging MUST be explicitly configured via environment variables
 * unless allowLocalFallback is enabled (not recommended for CI/prod).
 */
const BASE_PROJECT = {
  authDomain: "sk8hub-d7806.firebaseapp.com",
  projectId: "sk8hub-d7806",
  storageBucket: "sk8hub-d7806.firebasestorage.app",
  messagingSenderId: "665573979824",
} as const;

const PROD_BASELINE: FirebaseConfig = {
  apiKey:
    getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_API_KEY_PROD") ??
    "DUMMY_FIREBASE_API_KEY",
  ...BASE_PROJECT,
  appId: "1:665573979824:web:731aaae46daea5efee2d75",
  measurementId: "G-7XVNF1LHZW",
};

const STAGING_BASELINE: FirebaseConfig = {
  ...PROD_BASELINE,
  // Enterprise rule: staging should have its own Firebase Web App (same project).
  // Set EXPO_PUBLIC_FIREBASE_APP_ID_STAGING, EXPO_PUBLIC_FIREBASE_API_KEY_STAGING, etc.
  // If not set, we still validate and fail in staging unless allowLocalFallback is true.
};

/**
 * Configuration policy
 * - In prod/staging: require env vars to be present & valid (no silent fallbacks).
 * - In local/dev: allow baseline fallback for ergonomics.
 */
export interface FirebaseConfigOptions {
  /**
   * Provide a logger for diagnostics. Defaults to no-op.
   * Do not log secrets; this module only logs non-sensitive metadata.
   */
  logger?: {
    info?: LogFn;
    warn?: LogFn;
    error?: LogFn;
  };

  /**
   * If true, allows using hardcoded baseline config in non-local envs.
   * Default: false (recommended).
   */
  allowLocalFallback?: boolean;
}

const emailish = (s: string) => s.includes("@"); // not used, just placeholder pattern idea

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isNonEmpty(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

function isFirebaseAppId(appId: string): boolean {
  // Typical web appId format: "1:<senderId>:web:<hex>"
  // Keep tolerant but protective.
  return /^1:\d{6,}:(web|ios|android):[A-Za-z0-9]+$/.test(appId);
}

function isDomainLike(domain: string): boolean {
  // very lightweight check: "x.y"
  return /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain);
}

function validateConfig(cfg: FirebaseConfig, env: AppEnv): FirebaseConfig {
  assert(isNonEmpty(cfg.apiKey), `[Firebase] apiKey is required (${env})`);
  assert(isNonEmpty(cfg.projectId), `[Firebase] projectId is required (${env})`);
  assert(isNonEmpty(cfg.appId), `[Firebase] appId is required (${env})`);
  assert(isNonEmpty(cfg.authDomain), `[Firebase] authDomain is required (${env})`);
  assert(isNonEmpty(cfg.storageBucket), `[Firebase] storageBucket is required (${env})`);
  assert(
    isNonEmpty(cfg.messagingSenderId),
    `[Firebase] messagingSenderId is required (${env})`
  );

  // Guardrails
  assert(
    cfg.projectId === BASE_PROJECT.projectId,
    `[Firebase] projectId mismatch: expected "${BASE_PROJECT.projectId}", got "${cfg.projectId}" (${env})`
  );

  // authDomain should look like "<projectId>.firebaseapp.com" unless explicitly overridden.
  assert(
    isDomainLike(cfg.authDomain),
    `[Firebase] authDomain looks invalid: "${cfg.authDomain}" (${env})`
  );

  // storage bucket varies (.appspot.com vs .firebasestorage.app) but must be non-empty.
  assert(
    isDomainLike(cfg.storageBucket),
    `[Firebase] storageBucket looks invalid: "${cfg.storageBucket}" (${env})`
  );

  assert(
    isFirebaseAppId(cfg.appId),
    `[Firebase] appId looks invalid: "${cfg.appId}" (${env})`
  );

  // measurementId is optional; if present, validate format
  if (cfg.measurementId) {
    assert(
      /^G-[A-Z0-9]{6,}$/.test(cfg.measurementId),
      `[Firebase] measurementId looks invalid: "${cfg.measurementId}" (${env})`
    );
  }

  return cfg;
}

/**
 * Read environment-provided config.
 * Supports two patterns:
 * 1) Generic: EXPO_PUBLIC_FIREBASE_* (single set)
 * 2) Env-specific: EXPO_PUBLIC_FIREBASE_*_PROD / *_STAGING
 */
function readEnvConfig(env: AppEnv): FirebaseConfig | null {
  // Prefer env-specific keys if present
  const suffix =
    env === "prod" ? "_PROD" : env === "staging" ? "_STAGING" : "";

  const apiKey =
    (suffix && getPublicEnvOptional(`EXPO_PUBLIC_FIREBASE_API_KEY${suffix}`)) ||
    getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_API_KEY");

  const projectId =
    (suffix && getPublicEnvOptional(`EXPO_PUBLIC_FIREBASE_PROJECT_ID${suffix}`)) ||
    getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_PROJECT_ID");

  const appId =
    (suffix && getPublicEnvOptional(`EXPO_PUBLIC_FIREBASE_APP_ID${suffix}`)) ||
    getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID");

  // If key pieces are missing, treat as not-configured
  if (!apiKey || !projectId || !appId) return null;

  const authDomain =
    (suffix && getPublicEnvOptional(`EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN${suffix}`)) ||
    getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN") ||
    `${projectId}.firebaseapp.com`;

  const storageBucket =
    (suffix && getPublicEnvOptional(`EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET${suffix}`)) ||
    getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET") ||
    `${projectId}.firebasestorage.app`;

  const messagingSenderId =
    (suffix &&
      getPublicEnvOptional(`EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID${suffix}`)) ||
    getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") ||
    BASE_PROJECT.messagingSenderId;

  const measurementId =
    (suffix && getPublicEnvOptional(`EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID${suffix}`)) ||
    getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID");

  return {
    apiKey,
    projectId,
    appId,
    authDomain,
    storageBucket,
    messagingSenderId,
    measurementId: measurementId ?? undefined,
  };
}

function getBaseline(env: AppEnv): FirebaseConfig {
  switch (env) {
    case "prod":
      return PROD_BASELINE;
    case "staging":
      return STAGING_BASELINE;
    default:
      // Local dev uses the same project but should namespace data at the app layer.
      return PROD_BASELINE;
  }
}

/**
 * Get Firebase config for current environment.
 *
 * Precedence:
 * 1) Environment variables (validated)
 * 2) Baseline config (ONLY allowed for local, unless allowLocalFallback is true)
 */
export function getFirebaseConfig(options: FirebaseConfigOptions = {}): FirebaseConfig {
  const env = getAppEnv();
  const log = {
    info: options.logger?.info ?? noop,
    warn: options.logger?.warn ?? noop,
    error: options.logger?.error ?? noop,
  };

  const envConfig = readEnvConfig(env);

  if (envConfig) {
    const validated = validateConfig(envConfig, env);
    log.info("[Firebase] Using env-provided config", {
      env,
      projectId: validated.projectId,
      appIdSuffix: validated.appId.slice(-6),
    });
    return validated;
  }

  const allowFallback =
    env === "local" || env === "development" || options.allowLocalFallback === true;

  if (!allowFallback) {
    // Fail fast in staging/prod instead of silently using prod config.
    throw new Error(
      `[Firebase] Missing required env config for "${env}". ` +
        `Set EXPO_PUBLIC_FIREBASE_API_KEY_${env.toUpperCase()}, ` +
        `EXPO_PUBLIC_FIREBASE_PROJECT_ID_${env.toUpperCase()}, ` +
        `EXPO_PUBLIC_FIREBASE_APP_ID_${env.toUpperCase()} (or the non-suffixed equivalents).`
    );
  }

  const baseline = getBaseline(env);
  const validated = validateConfig(baseline, env);

  log.warn("[Firebase] Using baseline config fallback", {
    env,
    projectId: validated.projectId,
    appIdSuffix: validated.appId.slice(-6),
  });

  return validated;
}

/**
 * Get expected Firebase App ID for an environment (guardrail)
 */
export function getExpectedAppId(env: AppEnv): string {
  const envSpecific =
    env === "prod"
      ? getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_PROD")
      : env === "staging"
        ? getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_STAGING")
        : null;

  return envSpecific || getBaseline(env).appId;
}

/**
 * Authorized domains for Firebase Auth (reference)
 *
 * Configure: Firebase Console → Authentication → Settings → Authorized domains
 *
 * Enterprise posture:
 * - Do NOT authorize wildcard preview domains (*.vercel.app).
 * - Keep localhost only for development.
 */
export const AUTHORIZED_DOMAINS = {
  prod: ["skatehubba.com", "www.skatehubba.com", "api.skatehubba.com"],
  staging: ["staging.skatehubba.com", "staging-api.skatehubba.com"],
  local: ["localhost"],
} as const;
