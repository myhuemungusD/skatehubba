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
  `http://localhost:${process.env.DEV_CLIENT_PORT || "3000"}`,
  `http://localhost:${process.env.DEV_EMAIL_PORT || "1025"}`,
] as const;

/** Default dev origin used as fallback (e.g. Stripe checkout redirect) */
export const DEV_DEFAULT_ORIGIN = DEV_ORIGINS[0];

/**
 * Returns the list of allowed origins for the current environment.
 * Matches the CORS origin logic in server/index.ts.
 */
export function getAllowedOrigins(): string[] {
  const envOrigins =
    process.env.ALLOWED_ORIGINS?.split(",")
      .map((o) => o.trim())
      .filter(Boolean) || [];
  if (process.env.NODE_ENV === "production") {
    return envOrigins;
  }
  return [...envOrigins, ...DEV_ORIGINS];
}

/**
 * Validate that an origin is in the allowed list.
 * Returns the origin if valid, or a safe fallback origin.
 * In production the fallback is the first ALLOWED_ORIGINS entry (not localhost).
 */
export function validateOrigin(origin: string | undefined): string {
  const allowed = getAllowedOrigins();
  const fallback = allowed[0] || DEV_DEFAULT_ORIGIN;
  if (!origin) return fallback;
  return allowed.includes(origin) ? origin : fallback;
}

/** Express body parser size limit */
export const BODY_PARSE_LIMIT = "10mb";
