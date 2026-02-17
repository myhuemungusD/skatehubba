/**
 * Certificate Pinning Runtime Service
 *
 * Provides JavaScript-level defense-in-depth for certificate pinning:
 *
 * 1. Domain allowlisting — requests to non-allowlisted domains are rejected
 *    before they reach the network stack.
 * 2. Pin expiration monitoring — warns when configured pins are approaching
 *    their expiration date so the team can rotate them proactively.
 * 3. Failure reporting — logs pinning failures for monitoring dashboards.
 *
 * The actual TLS certificate validation is handled at the native OS level
 * (Android Network Security Config / iOS NSPinnedDomains). This module
 * cannot inspect the TLS handshake from JavaScript, but it adds an
 * additional layer of protection at the application layer.
 */

import {
  getAppEnv,
  isProd,
  getCertificatePinningConfig,
  isDomainAllowed,
  type CertificatePinningConfig,
  type PinnedDomain,
} from "@skatehubba/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PinValidationResult {
  readonly allowed: boolean;
  readonly hostname: string;
  readonly reason?: string;
}

export interface PinningFailureEvent {
  readonly hostname: string;
  readonly url: string;
  readonly reason: string;
  readonly timestamp: number;
  readonly environment: string;
}

type FailureListener = (event: PinningFailureEvent) => void;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cachedConfig: CertificatePinningConfig | null = null;
const failureListeners: Set<FailureListener> = new Set();

/** Limit stored failures to avoid memory leaks. */
const MAX_FAILURE_LOG = 50;
const recentFailures: PinningFailureEvent[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the certificate pinning service.
 *
 * Call this once at app startup (e.g. in the root layout). It loads
 * the pinning configuration and starts monitoring pin expiration.
 */
export function initCertificatePinning(): void {
  cachedConfig = getCertificatePinningConfig();

  if (cachedConfig.enabled) {
    const domainNames = cachedConfig.domains.map((d: PinnedDomain) => d.hostname).join(", ");
    console.log(`[CertPinning] Active for: ${domainNames}`);
    checkPinExpiration(cachedConfig);
  } else if (typeof __DEV__ !== "undefined" && !__DEV__) {
    // Warn in non-dev builds if pinning is disabled
    console.warn(
      "[CertPinning] Certificate pinning is DISABLED. " +
        "Configure SPKI pins for production builds."
    );
  }
}

/**
 * Validate that a URL targets an allowed domain.
 *
 * This function is called before every API request to enforce the
 * domain allowlist. It does NOT validate the TLS certificate — that
 * is handled by the native pinning layer.
 *
 * @param url - The full URL to validate
 * @returns Validation result with allowed status and reason
 */
export function validateRequestDomain(url: string): PinValidationResult {
  const env = getAppEnv();

  // In local development, allow all domains
  if (env === "local") {
    return { allowed: true, hostname: extractHostname(url) };
  }

  const hostname = extractHostname(url);

  if (!hostname) {
    // Relative URLs (e.g. "/api/spots") have no hostname — they resolve
    // to the base URL which is already controlled by the app's config.
    // Empty hostname from a relative path is allowed; genuinely unparseable
    // URLs (non-relative, non-absolute) are rejected.
    if (url.startsWith("/")) {
      return { allowed: true, hostname: "" };
    }
    return {
      allowed: false,
      hostname: "",
      reason: "Could not parse hostname from URL",
    };
  }

  if (isDomainAllowed(hostname)) {
    return { allowed: true, hostname };
  }

  const event: PinningFailureEvent = {
    hostname,
    url: redactUrl(url),
    reason: "Domain not in allowlist",
    timestamp: Date.now(),
    environment: env,
  };

  recordFailure(event);

  return {
    allowed: false,
    hostname,
    reason: `Domain "${hostname}" is not in the allowed domains list`,
  };
}

/**
 * Register a listener for certificate pinning failure events.
 *
 * Use this to integrate with analytics, error tracking (Sentry), or
 * custom monitoring dashboards.
 *
 * @param listener - Callback invoked on each failure event
 * @returns Unsubscribe function
 */
export function onPinningFailure(listener: FailureListener): () => void {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

/**
 * Get recent pinning failure events for debugging.
 * Returns at most the last 50 events.
 */
export function getRecentFailures(): readonly PinningFailureEvent[] {
  return [...recentFailures];
}

/**
 * Check if certificate pinning is currently active.
 */
export function isPinningEnabled(): boolean {
  if (!cachedConfig) {
    cachedConfig = getCertificatePinningConfig();
  }
  return cachedConfig.enabled;
}

/**
 * Reset internal state. Only for use in tests.
 * @internal
 */
export function _resetForTesting(): void {
  cachedConfig = null;
  recentFailures.length = 0;
  failureListeners.clear();
}

/**
 * Report a network error that may be caused by a certificate pinning failure.
 *
 * Call this from the API client's error handler when a request fails with
 * a network-level error (not an HTTP error). Native pinning rejections
 * surface as generic network errors in JavaScript.
 */
export function reportPossiblePinningFailure(url: string, error: unknown): void {
  if (!isPinningEnabled()) return;

  const hostname = extractHostname(url);
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Heuristic: TLS/SSL failures from native pinning surface as these errors
  const pinningErrorPatterns = [
    "Network request failed",
    "SSL",
    "TLS",
    "certificate",
    "CERT_",
    "ERR_CERT",
    "NSURLErrorServerCertificateUntrusted",
    "javax.net.ssl.SSLHandshakeException",
    "java.security.cert.CertPathValidatorException",
    "Trust anchor for certification path not found",
  ];

  const isPossiblePinFailure = pinningErrorPatterns.some((pattern) =>
    errorMessage.includes(pattern)
  );

  if (isPossiblePinFailure) {
    const event: PinningFailureEvent = {
      hostname,
      url: redactUrl(url),
      reason: `Possible TLS pinning failure: ${errorMessage}`,
      timestamp: Date.now(),
      environment: getAppEnv(),
    };

    recordFailure(event);

    if (isProd()) {
      console.error(
        `[CertPinning] POSSIBLE PIN FAILURE for ${hostname}. ` +
          "This may indicate a MITM attack or expired/rotated certificates. " +
          "Error: " +
          errorMessage
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract hostname from a URL string.
 * Handles both absolute URLs and relative paths.
 */
function extractHostname(url: string): string {
  try {
    // Handle relative URLs by treating them as allowed
    if (url.startsWith("/")) return "";

    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "";
  }
}

/**
 * Redact sensitive parts of a URL for logging.
 * Preserves scheme, host, and path but removes query parameters
 * which may contain tokens or user data.
 */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "[invalid URL]";
  }
}

/**
 * Record a failure event and notify listeners.
 */
function recordFailure(event: PinningFailureEvent): void {
  // Store in recent failures (bounded)
  recentFailures.push(event);
  if (recentFailures.length > MAX_FAILURE_LOG) {
    recentFailures.shift();
  }

  // Notify listeners
  for (const listener of failureListeners) {
    try {
      listener(event);
    } catch {
      // Don't let listener errors crash the app
    }
  }
}

/**
 * Check if configured pins are approaching expiration and log a warning.
 */
function checkPinExpiration(config: CertificatePinningConfig): void {
  if (!config.pinExpiration) return;

  const expiration = new Date(config.pinExpiration);
  if (isNaN(expiration.getTime())) return;

  const now = new Date();
  const daysUntilExpiry = Math.floor(
    (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry <= 0) {
    console.error(
      "[CertPinning] WARNING: Certificate pins have EXPIRED. " +
        "Native pinning will fall back to standard certificate validation. " +
        "Rotate pins immediately."
    );
  } else if (daysUntilExpiry <= 30) {
    console.warn(
      `[CertPinning] Certificate pins expire in ${daysUntilExpiry} days ` +
        `(${config.pinExpiration}). Schedule pin rotation.`
    );
  } else if (daysUntilExpiry <= 90) {
    console.log(
      `[CertPinning] Pin expiration: ${config.pinExpiration} ` +
        `(${daysUntilExpiry} days remaining)`
    );
  }
}
