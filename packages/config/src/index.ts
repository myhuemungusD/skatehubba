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

// Universal environment adapter
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

// Environment contract (single source of truth for env var names)
export {
  REQUIRED_PUBLIC_VARS,
  OPTIONAL_PUBLIC_VARS,
  ALL_PUBLIC_VARS,
  isCanonicalPrefix,
  detectPrefixMismatch,
  validatePublicEnv,
  type RequiredPublicVar,
  type OptionalPublicVar,
  type PublicVar,
} from "./envContract";

// Certificate pinning
export {
  getCertificatePinningConfig,
  getAllowedApiDomains,
  isDomainAllowed,
  isValidSpkiPin,
  CERT_PIN_ENV_KEYS,
  type CertificatePin,
  type PinnedDomain,
  type CertificatePinningConfig,
  type SpkiPin,
} from "./certificatePinning";
