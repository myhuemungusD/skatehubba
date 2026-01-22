/**
 * @skatehubba/config
 *
 * Universal configuration package for SkateHubba web and mobile apps.
 * Provides environment-safe config access that works with:
 * - Vite (web)
 * - Metro/Expo (mobile)
 * - Node.js (server/scripts)
 *
 * ## Quick Start
 *
 * ```typescript
 * import { getAppEnv, getFirebaseConfig, validateEnv } from '@skatehubba/config';
 *
 * // Validate environment at startup
 * validateEnv();
 *
 * // Get current environment
 * const env = getAppEnv(); // 'prod' | 'staging' | 'local'
 *
 * // Get Firebase config
 * const config = getFirebaseConfig();
 * ```
 *
 * ## Environment Variables
 *
 * All env vars use the `EXPO_PUBLIC_` prefix for universal compatibility:
 *
 * - `EXPO_PUBLIC_APP_ENV` - 'prod' | 'staging' | 'local'
 * - `EXPO_PUBLIC_API_BASE_URL` - API server URL
 * - `EXPO_PUBLIC_CANONICAL_ORIGIN` - Canonical origin for mobile
 * - `EXPO_PUBLIC_FIREBASE_*` - Firebase configuration
 *
 * @module @skatehubba/config
 */

// Universal environment adapter (NEW - USE THIS!)
export {
  getEnv,
  getEnvOptional,
  getEnvBool,
  getEnvNumber,
  getAppEnv,
  isProd,
  isStaging,
  isLocal,
  getFirebaseEnv,
  getApiEnv,
  getAppConfig,
  getFeatureFlags,
  validateEnv,
  isDebugMode,
  type AppEnv,
} from "./env";

// Legacy environment utilities (deprecated - use env.ts instead)
export { getPublicEnv, getPublicEnvOptional, getMissingPublicEnvVars } from "./publicEnv";

// Runtime utilities
export {
  getCanonicalOrigin,
  getEnvNamespace,
  getApiBaseUrl,
  isWeb,
  isMobile,
  getEnvPath,
  getStoragePath,
} from "./runtime";

// Guardrails
export {
  assertEnvWiring,
  getEnvBanner,
  shouldShowEnvBanner,
  validateWritePath,
  EnvMismatchError,
} from "./guardrails";

// Firebase config
export {
  getFirebaseConfig,
  getExpectedAppId,
  AUTHORIZED_DOMAINS,
  type FirebaseConfig,
} from "./firebase";
