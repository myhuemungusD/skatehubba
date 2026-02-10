/**
 * Server Configuration
 *
 * Centralized configuration for server ports, CORS origins, and body parsing.
 * Port-based values are configurable via environment variables with sensible defaults.
 */

/** Default port for the Express server (also configured in env.ts schema) */
export const SERVER_PORT = parseInt(process.env.PORT || "3001", 10);

/**
 * Development origins for CORS and fallback URLs.
 * Override individual ports via environment variables for custom setups.
 */
export const DEV_ORIGINS = [
  `http://localhost:${process.env.DEV_VITE_PORT || "5173"}`,
  `http://localhost:${process.env.DEV_CLIENT_PORT || "3000"}`,
  `http://localhost:${process.env.DEV_EMAIL_PORT || "5000"}`,
] as const;

/** Default dev origin used as fallback (e.g. Stripe checkout redirect) */
export const DEV_DEFAULT_ORIGIN = DEV_ORIGINS[0];

/** Express body parser size limit */
export const BODY_PARSE_LIMIT = "10mb";
