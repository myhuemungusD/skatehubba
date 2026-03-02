/**
 * Application Constants
 *
 * Named constants extracted from magic numbers across the codebase.
 * Grouped by feature area for discoverability.
 *
 * NOTE: Rate limit config lives in ./rateLimits.ts
 * NOTE: Auth/session constants live here; additional security config lives in ../security.ts
 */

// ============================================================================
// Socket.io Configuration
// ============================================================================

/** Time (ms) to wait for a pong before considering the connection dead */
export const SOCKET_PING_TIMEOUT_MS = 20_000;

/** Interval (ms) between ping packets sent to clients */
export const SOCKET_PING_INTERVAL_MS = 25_000;

/** Time (ms) to wait for transport upgrade to complete */
export const SOCKET_UPGRADE_TIMEOUT_MS = 10_000;

/** Maximum size (bytes) of a single HTTP long-polling request body (1 MB) */
export const SOCKET_MAX_HTTP_BUFFER_SIZE = 1_048_576;

/** How long (ms) to preserve connection state for reconnecting clients (2 min) */
export const SOCKET_MAX_DISCONNECTION_DURATION_MS = 2 * 60 * 1000;

// ============================================================================
// File Upload Limits
// ============================================================================

/** Maximum avatar file size in bytes (5 MB) */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// ============================================================================
// Auth & Session
// ============================================================================

/** Rolling window (ms) for counting failed login attempts (1 hour) */
export const LOGIN_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

/** Max age (ms) for the session cookie (24 hours) */
export const SESSION_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Validity window (ms) for email verification tokens (24 hours) */
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** How long (ms) a re-authentication is considered fresh (5 min) */
export const REAUTH_FRESHNESS_MS = 5 * 60 * 1000;

// ============================================================================
// Game (S.K.A.T.E.)
// ============================================================================

// Re-export from single source of truth
export { SKATE_LETTERS_TO_LOSE } from "@skatehubba/utils";

// ============================================================================
// Geolocation
// ============================================================================

/** Maximum GPS accuracy bonus (meters) applied to check-in radius */
export const MAX_ACCURACY_BONUS_METERS = 100;

// ============================================================================
// Admin / Pagination
// ============================================================================

/** Default page size for admin list endpoints */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum page size for admin list endpoints */
export const MAX_PAGE_SIZE = 50;

/** Maximum page size for audit log queries */
export const MAX_AUDIT_PAGE_SIZE = 100;

/** Default page size for audit log queries */
export const DEFAULT_AUDIT_PAGE_SIZE = 50;

// ============================================================================
// Username Generation
// ============================================================================

/** Maximum attempts when auto-generating a unique username */
export const MAX_USERNAME_GENERATION_ATTEMPTS = 5;
