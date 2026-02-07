/**
 * Environment Guardrails
 *
 * Runtime checks to ensure environment configuration is correct.
 * Prevents staging → prod leaks and misconfiguration.
 *
 * Call `assertEnvWiring()` at app startup to catch misconfigurations early.
 *
 * @module @skatehubba/config/guardrails
 */

import { getPublicEnvOptional, getAppEnv } from "./publicEnv";

/**
 * Environment wiring error - thrown when environment is misconfigured
 */
export class EnvMismatchError extends Error {
  constructor(message: string) {
    super(`🚨 ENV MISMATCH: ${message}`);
    this.name = "EnvMismatchError";
  }
}

/**
 * Validate that environment configuration is consistent
 *
 * Checks:
 * 1. API base URL matches expected environment
 * 2. Firebase appId matches expected environment (if using single-project separation)
 *
 * @throws EnvMismatchError if configuration is inconsistent
 */
export function assertEnvWiring(): void {
  const env = getAppEnv();
  const apiBase = getPublicEnvOptional("EXPO_PUBLIC_API_BASE_URL") ?? "";
  const firebaseAppId = getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID") ?? "";

  // Check API base URL consistency
  let apiLooksProd = false;
  let apiLooksStaging = false;
  let apiLooksLocal = false;

  if (apiBase) {
    try {
      const parsed = new URL(apiBase);
      const host = parsed.hostname;

      // Treat the canonical production API host as prod.
      apiLooksProd = host === "api.skatehubba.com";

      // Treat known staging hosts as staging. Adjust if additional staging hosts are introduced.
      apiLooksStaging = host === "staging-api.skatehubba.com";

      // Local development hosts.
      apiLooksLocal = host === "localhost" || host === "127.0.0.1";
    } catch {
      // If the URL is invalid, leave all flags false and let existing checks handle it.
    }
  }

  if (env === "prod") {
    if (apiLooksStaging) {
      throw new EnvMismatchError("prod build pointing at staging API");
    }
    if (apiLooksLocal) {
      throw new EnvMismatchError("prod build pointing at localhost API");
    }
  }

  if (env === "staging") {
    if (apiLooksProd) {
      throw new EnvMismatchError("staging build pointing at prod API");
    }
    // Staging build pointing at localhost is allowed (likely intentional during development)
  }

  // Check Firebase appId consistency (if using single-project app separation)
  const prodAppId = getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_PROD");
  const stagingAppId = getPublicEnvOptional("EXPO_PUBLIC_FIREBASE_APP_ID_STAGING");

  if (prodAppId && stagingAppId && firebaseAppId) {
    if (env === "prod" && firebaseAppId !== prodAppId) {
      throw new EnvMismatchError(
        `prod build using non-prod Firebase appId. Expected: ${prodAppId}, Got: ${firebaseAppId}`
      );
    }
    if (env === "staging" && firebaseAppId !== stagingAppId) {
      throw new EnvMismatchError(
        `staging build using non-staging Firebase appId. Expected: ${stagingAppId}, Got: ${firebaseAppId}`
      );
    }
  }

  // Validation passed
}

/**
 * Get a visual banner for non-production environments
 *
 * Returns null in production, otherwise returns banner text
 */
export function getEnvBanner(): string | null {
  const env = getAppEnv();
  switch (env) {
    case "staging":
      return "🧪 STAGING ENVIRONMENT";
    case "local":
      return "🛠️ LOCAL DEVELOPMENT";
    default:
      return null;
  }
}

/**
 * Check if env banner should be shown
 */
export function shouldShowEnvBanner(): boolean {
  return getEnvBanner() !== null;
}

/**
 * Validate a write operation target
 *
 * Use before any Firestore/Storage write to ensure data goes to the right namespace.
 *
 * @param path - The path being written to
 * @throws EnvMismatchError if path doesn't match current environment
 */
export function validateWritePath(path: string): void {
  const env = getAppEnv();
  const expectedPrefix = `env/${env}/`;

  if (!path.startsWith(expectedPrefix)) {
    // Allow writes in local dev without namespace (for backwards compatibility)
    if (env === "local") {
      return;
    }
    throw new EnvMismatchError(
      `Write path "${path}" doesn't match environment namespace. Expected prefix: ${expectedPrefix}`
    );
  }
}
