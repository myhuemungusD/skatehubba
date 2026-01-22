/**
 * Universal Environment Variable Access
 *
 * Prefix policy:
 * - Web (Vite): use VITE_*
 * - Mobile (Expo/Metro): use EXPO_PUBLIC_*
 * - Server: reads from process.env
 *
 * The adapter normalizes names so VITE_* and EXPO_PUBLIC_* are interchangeable
 * for the same logical key, preventing crashes when the wrong prefix is used.
 * Avoids direct `import.meta` syntax which can break Metro bundler.
 *
 * @module @skatehubba/config/publicEnv
 */

type AnyEnv = Record<string, string | undefined>;

const EXPO_PREFIX = "EXPO_PUBLIC_";
const VITE_PREFIX = "VITE_";

function normalizeNameCandidates(name: string): string[] {
  const candidates = new Set<string>();

  candidates.add(name);

  // If name already has a known prefix, generate the sibling prefix variant
  if (name.startsWith(EXPO_PREFIX)) {
    const base = name.slice(EXPO_PREFIX.length);
    candidates.add(`${VITE_PREFIX}${base}`);
  } else if (name.startsWith(VITE_PREFIX)) {
    const base = name.slice(VITE_PREFIX.length);
    candidates.add(`${EXPO_PREFIX}${base}`);
  } else {
    // If no prefix, try both common prefixes for convenience
    candidates.add(`${EXPO_PREFIX}${name}`);
    candidates.add(`${VITE_PREFIX}${name}`);
  }

  return Array.from(candidates);
}

function readCandidate(env: AnyEnv | undefined, name: string): string | undefined {
  if (!env) return undefined;
  for (const candidate of normalizeNameCandidates(name)) {
    const value = env[candidate];
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Read from Vite's import.meta.env (web builds)
 * Safe access without crashing Metro
 */
function readFromVite(name: string): string | undefined {
  // Safe access: Metro doesn't have import.meta, so we check via globalThis

  const meta = (globalThis as any).import?.meta;
  const env: AnyEnv | undefined = meta?.env;
  return readCandidate(env, name);
}

/**
 * Read from process.env (Node.js, Expo)
 */
function readFromProcess(name: string): string | undefined {
  const env: AnyEnv | undefined = (globalThis as any).process?.env;
  return readCandidate(env, name);
}

/**
 * Get a public environment variable
 * Works in Vite (web), Metro (mobile), and Node.js (server)
 *
 * @param name - Full env var name (e.g., "EXPO_PUBLIC_API_BASE_URL")
 * @throws Error if the env var is not set
 */
export function getPublicEnv(name: string): string {
  const v = readFromVite(name) ?? readFromProcess(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Get a public environment variable with optional fallback
 * Returns undefined if not set (doesn't throw)
 */
export function getPublicEnvOptional(name: string): string | undefined {
  return readFromVite(name) ?? readFromProcess(name);
}

/**
 * Returns a list of missing env var names (original requested names) using
 * the cross-platform lookup rules above.
 */
export function getMissingPublicEnvVars(names: string[]): string[] {
  return names.filter((name) => !getPublicEnvOptional(name));
}

/**
 * Application environment type
 */
export type AppEnv = "prod" | "staging" | "local";

/**
 * Get the current application environment
 * Defaults to 'local' for development safety
 */
export function getAppEnv(): AppEnv {
  const v =
    readFromVite("EXPO_PUBLIC_APP_ENV") ?? readFromProcess("EXPO_PUBLIC_APP_ENV") ?? "local";
  if (v === "prod" || v === "staging" || v === "local") return v;
  return "local";
}

/**
 * Check if running in production
 */
export function isProd(): boolean {
  return getAppEnv() === "prod";
}

/**
 * Check if running in staging
 */
export function isStaging(): boolean {
  return getAppEnv() === "staging";
}

/**
 * Check if running in local development
 */
export function isLocal(): boolean {
  return getAppEnv() === "local";
}
