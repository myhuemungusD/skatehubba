/**
 * Certificate Pinning Configuration
 *
 * Centralized SSL/TLS certificate pin management for SkateHubba API domains.
 * Pins are SPKI SHA-256 hashes (Subject Public Key Info) encoded as base64.
 *
 * Security model:
 * - Pins are enforced at the OS level via Android Network Security Config
 *   and iOS NSPinnedDomains (configured by the Expo config plugin).
 * - The JavaScript layer performs domain allowlisting and monitors failures.
 * - Firebase domains are NOT pinned (Google rotates certificates frequently);
 *   use Firebase App Check for Firebase service protection instead.
 *
 * Pin rotation:
 * - Each domain carries a primary pin and at least one backup pin.
 * - Backup pins MUST be from a different certificate chain (e.g. different CA
 *   or a pre-generated key pair) to survive CA compromise or re-keying.
 * - When rotating, promote the new pin to primary and generate a fresh backup.
 * - Android pin-set expiration provides a hard deadline; after expiry the OS
 *   falls back to normal certificate validation rather than bricking the app.
 *
 * Obtaining SPKI pins:
 * ```bash
 * # Leaf certificate pin:
 * openssl s_client -connect api.skatehubba.com:443 -servername api.skatehubba.com \
 *   </dev/null 2>/dev/null \
 *   | openssl x509 -pubkey -noout \
 *   | openssl pkey -pubin -outform DER \
 *   | openssl dgst -sha256 -binary \
 *   | openssl enc -base64
 *
 * # Full chain (leaf + intermediates):
 * openssl s_client -connect api.skatehubba.com:443 -servername api.skatehubba.com \
 *   -showcerts </dev/null 2>/dev/null \
 *   | awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{ print }' \
 *   | csplit -z -f cert- - '/BEGIN CERTIFICATE/' '{*}' && \
 *   for f in cert-*; do
 *     echo "--- $f ---";
 *     openssl x509 -in "$f" -pubkey -noout \
 *       | openssl pkey -pubin -outform DER \
 *       | openssl dgst -sha256 -binary \
 *       | openssl enc -base64;
 *   done
 * ```
 *
 * @module @skatehubba/config/certificatePinning
 */

import { getAppEnv, getEnvOptional, type AppEnv } from "./env";

/**
 * A single SPKI SHA-256 pin encoded as base64.
 * Example: "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg="
 */
export type SpkiPin = string;

/** Certificate pin entry with metadata. */
export interface CertificatePin {
  /** Base64-encoded SHA-256 hash of the Subject Public Key Info */
  readonly hash: SpkiPin;
  /** Human-readable label (e.g. "Let's Encrypt R3", "Backup key 2025") */
  readonly label: string;
  /** Whether this is the primary (currently active) pin */
  readonly isPrimary: boolean;
}

/** Domain-level pinning configuration. */
export interface PinnedDomain {
  /** Hostname to pin (e.g. "api.skatehubba.com") */
  readonly hostname: string;
  /** Whether to include all subdomains */
  readonly includeSubdomains: boolean;
  /**
   * Certificate pins. Must contain at least two pins:
   * one primary and one backup from a different chain.
   */
  readonly pins: readonly CertificatePin[];
}

/** Top-level certificate pinning configuration. */
export interface CertificatePinningConfig {
  /** Whether certificate pinning is enabled */
  readonly enabled: boolean;
  /** Domains with pinning configuration */
  readonly domains: readonly PinnedDomain[];
  /**
   * ISO 8601 date after which pins expire.
   * Android Network Security Config enforces this; after expiry, the OS
   * falls back to standard certificate validation. This prevents bricking
   * the app if pins cannot be rotated in time.
   */
  readonly pinExpiration: string;
  /** Allow cleartext traffic for debug builds (Android only) */
  readonly allowDebugOverrides: boolean;
  /** Report URI for pin validation failures (for monitoring) */
  readonly reportUri?: string;
}

// ---------------------------------------------------------------------------
// Pin values
//
// IMPORTANT: Replace these placeholder pins with actual SPKI hashes from
// your server certificates BEFORE releasing to production.
//
// The pins below are configured via environment variables so they can be
// updated at build time without code changes. When env vars are not set,
// pinning is disabled to avoid locking out development builds.
// ---------------------------------------------------------------------------

const ENV_PIN_KEYS = {
  apiPrimary: "EXPO_PUBLIC_CERT_PIN_API_PRIMARY",
  apiBackup: "EXPO_PUBLIC_CERT_PIN_API_BACKUP",
  stagingPrimary: "EXPO_PUBLIC_CERT_PIN_STAGING_PRIMARY",
  stagingBackup: "EXPO_PUBLIC_CERT_PIN_STAGING_BACKUP",
} as const;

function readPinFromEnv(key: string): string | undefined {
  const value = getEnvOptional(key);
  if (!value || value.trim() === "" || value === "PLACEHOLDER") return undefined;
  return value.trim();
}

function hasPinsConfigured(env: AppEnv): boolean {
  if (env === "prod") {
    return !!(readPinFromEnv(ENV_PIN_KEYS.apiPrimary) && readPinFromEnv(ENV_PIN_KEYS.apiBackup));
  }
  if (env === "staging") {
    return !!(
      readPinFromEnv(ENV_PIN_KEYS.stagingPrimary) && readPinFromEnv(ENV_PIN_KEYS.stagingBackup)
    );
  }
  return false;
}

function buildProductionDomains(): PinnedDomain[] {
  const primary = readPinFromEnv(ENV_PIN_KEYS.apiPrimary);
  const backup = readPinFromEnv(ENV_PIN_KEYS.apiBackup);

  if (!primary || !backup) return [];

  return [
    {
      hostname: "api.skatehubba.com",
      includeSubdomains: false,
      pins: [
        { hash: primary, label: "API primary", isPrimary: true },
        { hash: backup, label: "API backup", isPrimary: false },
      ],
    },
  ];
}

function buildStagingDomains(): PinnedDomain[] {
  const primary = readPinFromEnv(ENV_PIN_KEYS.stagingPrimary);
  const backup = readPinFromEnv(ENV_PIN_KEYS.stagingBackup);

  if (!primary || !backup) return [];

  return [
    {
      hostname: "staging-api.skatehubba.com",
      includeSubdomains: false,
      pins: [
        { hash: primary, label: "Staging primary", isPrimary: true },
        { hash: backup, label: "Staging backup", isPrimary: false },
      ],
    },
  ];
}

/**
 * Get the certificate pinning configuration for the current environment.
 *
 * Returns a config with `enabled: false` when pins are not configured
 * (local development) to avoid locking developers out.
 */
export function getCertificatePinningConfig(): CertificatePinningConfig {
  const env = getAppEnv();

  // Never enable pinning in local development
  if (env === "local") {
    return {
      enabled: false,
      domains: [],
      pinExpiration: "",
      allowDebugOverrides: true,
    };
  }

  const pinsAvailable = hasPinsConfigured(env);

  if (!pinsAvailable) {
    console.warn(
      `[CertPinning] No certificate pins configured for ${env} environment. ` +
        `Set ${ENV_PIN_KEYS.apiPrimary} and ${ENV_PIN_KEYS.apiBackup} to enable pinning.`
    );
    return {
      enabled: false,
      domains: [],
      pinExpiration: "",
      allowDebugOverrides: env !== "prod",
    };
  }

  const expiration = getEnvOptional("EXPO_PUBLIC_CERT_PIN_EXPIRATION") || "2027-06-01";

  const domains = env === "prod" ? buildProductionDomains() : buildStagingDomains();

  return {
    enabled: true,
    domains,
    pinExpiration: expiration,
    allowDebugOverrides: false,
    reportUri: getEnvOptional("EXPO_PUBLIC_CERT_PIN_REPORT_URI"),
  };
}

/**
 * Domains that the mobile app is allowed to communicate with.
 *
 * This allowlist is enforced at the JavaScript level as an additional
 * defense-in-depth measure on top of native certificate pinning.
 * Requests to domains not in this list are rejected before being sent.
 */
export function getAllowedApiDomains(env?: AppEnv): readonly string[] {
  const currentEnv = env ?? getAppEnv();

  switch (currentEnv) {
    case "prod":
      return [
        "api.skatehubba.com",
        // Firebase domains — not pinned, protected by App Check
        "firebaseinstallations.googleapis.com",
        "firebaseremoteconfig.googleapis.com",
        "firestore.googleapis.com",
        "firebasestorage.googleapis.com",
        "securetoken.googleapis.com",
        "identitytoolkit.googleapis.com",
        "fcm.googleapis.com",
      ] as const;

    case "staging":
      return [
        "staging-api.skatehubba.com",
        "firebaseinstallations.googleapis.com",
        "firebaseremoteconfig.googleapis.com",
        "firestore.googleapis.com",
        "firebasestorage.googleapis.com",
        "securetoken.googleapis.com",
        "identitytoolkit.googleapis.com",
        "fcm.googleapis.com",
      ] as const;

    default:
      // Local development: allow localhost and any port
      return [] as const;
  }
}

/**
 * Check if a hostname is in the allowed domains list.
 * Returns true for all domains in local development.
 */
export function isDomainAllowed(hostname: string, env?: AppEnv): boolean {
  const currentEnv = env ?? getAppEnv();

  // In local dev, allow everything
  if (currentEnv === "local") return true;

  // Allow localhost in non-production for testing
  if (currentEnv !== "prod" && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return true;
  }

  const allowed = getAllowedApiDomains(currentEnv);
  return allowed.includes(hostname);
}

/** Environment variable keys for pin configuration (for documentation/tooling). */
export { ENV_PIN_KEYS as CERT_PIN_ENV_KEYS };
