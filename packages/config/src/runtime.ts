/**
 * Runtime Utilities
 *
 * Platform-safe utilities for determining origin and environment.
 * Works correctly on both web (has location) and mobile (no location).
 *
 * @module @skatehubba/config/runtime
 */

import { getPublicEnv, getPublicEnvOptional, getAppEnv, type AppEnv } from "./publicEnv";
import { globals } from "./globals";

/**
 * Get the canonical origin for the current platform
 *
 * - Web: Uses window.location.origin
 * - Mobile: Uses EXPO_PUBLIC_CANONICAL_ORIGIN env var
 *
 * @returns The canonical origin (e.g., "https://skatehubba.com")
 */
export function getCanonicalOrigin(): string {
  const loc = globals.location;
  if (loc?.origin) return loc.origin; // web
  return getPublicEnv("EXPO_PUBLIC_CANONICAL_ORIGIN"); // mobile
}

/**
 * Get the environment namespace for data separation
 *
 * Use this for Firestore paths, Storage paths, etc.
 * e.g., `/env/${getEnvNamespace()}/users/${userId}`
 */
export function getEnvNamespace(): AppEnv {
  return getAppEnv();
}

/**
 * Get the API base URL for the current environment
 *
 * On web the Express server serves both the SPA and the API on the same
 * origin, so we return "" (relative URLs).  In dev Vite proxies /api to
 * the backend; in prod Express handles /api directly.
 *
 * Mobile clients need an absolute URL because there is no same-origin
 * server, so they fall back to the environment-based defaults below.
 *
 * Set EXPO_PUBLIC_API_BASE_URL to override on any platform.
 */
export function getApiBaseUrl(): string {
  const override = getPublicEnvOptional("EXPO_PUBLIC_API_BASE_URL");
  if (override) return override;

  // Web: same-origin — works in both Vite dev (proxy) and Express prod
  if (isWeb()) return "";

  const env = getAppEnv();
  switch (env) {
    case "prod":
      return "https://api.skatehubba.com";
    case "staging":
      return "https://staging-api.skatehubba.com";
    default:
      return "http://localhost:3001";
  }
}

/**
 * Check if running on web platform
 */
export function isWeb(): boolean {
  return typeof globals.window !== "undefined" && typeof globals.document !== "undefined";
}

/**
 * Check if running on mobile (React Native)
 */
export function isMobile(): boolean {
  return typeof globals.navigator !== "undefined" && globals.navigator?.product === "ReactNative";
}

/**
 * Get a Firestore document path with environment namespace
 *
 * @example
 * getEnvPath('users/user123') // returns 'env/prod/users/user123' in prod
 * getEnvPath('users', 'user123') // also works
 */
export function getEnvPath(...segments: string[]): string {
  // Join all segments, then normalize by removing leading slashes and double slashes
  const rawPath = segments.join("/");
  const normalizedPath = rawPath.replace(/^\/+/, "").replace(/\/+/g, "/");
  return `env/${getEnvNamespace()}/${normalizedPath}`;
}

/**
 * Get a Storage path with environment namespace
 *
 * @example
 * getStoragePath('videos/trick123.mp4') // returns 'env/prod/videos/trick123.mp4' in prod
 * getStoragePath('videos', 'trick123.mp4') // also works
 */
export function getStoragePath(...segments: string[]): string {
  const rawPath = segments.join("/");
  const normalizedPath = rawPath.replace(/^\/+/, "").replace(/\/+/g, "/");
  return `env/${getEnvNamespace()}/${normalizedPath}`;
}
