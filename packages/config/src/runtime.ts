/**
 * Runtime Utilities
 *
 * Platform-safe utilities for determining origin and environment.
 * Works correctly on both web (has location) and mobile (no location).
 *
 * @module @skatehubba/config/runtime
 */

import { getEnv, getEnvOptional, getAppEnv, type AppEnv } from "./env";
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
  return getEnv("EXPO_PUBLIC_CANONICAL_ORIGIN"); // mobile
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
 * Resolution order:
 * 1. EXPO_PUBLIC_API_BASE_URL override (any platform)
 * 2. Web in local dev: "" (relative URLs — Vite proxies /api to backend)
 * 3. Environment-based defaults (prod/staging/local)
 *
 * In Docker production deploys Express serves both the SPA and API on the
 * same origin, so set EXPO_PUBLIC_API_BASE_URL="" (or leave it empty) there.
 *
 * On Vercel, the API is deployed as a serverless function at /api on the
 * same origin, so web always uses relative URLs (empty string). The Vercel
 * rewrite routes /api/* to the serverless function automatically.
 */
export function getApiBaseUrl(): string {
  const override = getEnvOptional("EXPO_PUBLIC_API_BASE_URL");
  if (override) return override;

  // On web, always use relative URLs. The API is served from the same origin:
  //   - Local dev: Vite proxy forwards /api → Express on port 3001
  //   - Vercel: Serverless function handles /api via rewrite
  //   - Docker: Express serves both SPA and API on the same port
  if (isWeb()) return "";

  // Mobile (React Native): needs an absolute URL to the backend
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
