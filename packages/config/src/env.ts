/**
 * Universal Environment Adapter
 * 
 * Single source of truth for ALL environment variables across:
 * - Web (Vite) - reads from import.meta.env
 * - Mobile (Metro/React Native) - reads from process.env
 * - Server (Node.js) - reads from process.env
 * 
 * CRITICAL: Always use these helpers instead of direct import.meta.env or process.env
 * to ensure compatibility across all platforms.
 * 
 * @module @skatehubba/config/env
 */

type EnvRecord = Record<string, string | undefined>;

/**
 * Detect the current platform
 */
function detectPlatform(): 'vite' | 'node' | 'metro' {
  // Check if we're in a Vite environment
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env) {
    return 'vite';
  }
  
  // Check if we're in Node.js or Metro
  if (typeof process !== 'undefined' && process.env) {
    // Metro doesn't have process.versions.node
    return typeof process.versions?.node === 'string' ? 'node' : 'metro';
  }
  
  // Fallback to node (server-side)
  return 'node';
}

/**
 * Read environment variable from the correct source based on platform
 */
function readEnv(name: string): string | undefined {
  const platform = detectPlatform();
  
  switch (platform) {
    case 'vite': {
      // Web: Read from Vite's import.meta.env
      const meta = (globalThis as any).import?.meta;
      const env: EnvRecord = meta?.env || {};
      return env[name];
    }
    
    case 'metro':
    case 'node': {
      // Mobile/Server: Read from process.env
      const env: EnvRecord = (globalThis as any).process?.env || {};
      return env[name];
    }
  }
}

/**
 * Get environment variable (throws if not found)
 */
export function getEnv(name: string): string {
  const value = readEnv(name);
  if (value === undefined || value === '') {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Get environment variable with fallback
 */
export function getEnvOptional(name: string, fallback?: string): string | undefined {
  return readEnv(name) || fallback;
}

/**
 * Get boolean environment variable
 */
export function getEnvBool(name: string, defaultValue = false): boolean {
  const value = readEnv(name);
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

/**
 * Get number environment variable
 */
export function getEnvNumber(name: string, defaultValue: number): number {
  const value = readEnv(name);
  if (value === undefined) return defaultValue;
  const num = Number(value);
  return Number.isNaN(num) ? defaultValue : num;
}

// ============================================================================
// Typed Environment Variables
// ============================================================================

/**
 * App Environment
 */
export type AppEnv = 'prod' | 'staging' | 'local';

export function getAppEnv(): AppEnv {
  const env = getEnvOptional('EXPO_PUBLIC_APP_ENV', 'local');
  if (env === 'prod' || env === 'staging' || env === 'local') {
    return env;
  }
  return 'local';
}

export const isProd = () => getAppEnv() === 'prod';
export const isStaging = () => getAppEnv() === 'staging';
export const isLocal = () => getAppEnv() === 'local';

/**
 * Firebase Configuration
 */
export function getFirebaseEnv() {
  return {
    apiKey: getEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: getEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: getEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
    measurementId: getEnvOptional('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID'),
  };
}

/**
 * API Configuration
 */
export function getApiEnv() {
  return {
    baseUrl: getEnvOptional('EXPO_PUBLIC_API_BASE_URL', 'http://localhost:3000'),
    timeout: getEnvNumber('EXPO_PUBLIC_API_TIMEOUT', 30000),
  };
}

/**
 * App Configuration
 */
export function getAppConfig() {
  return {
    version: getEnvOptional('VITE_APP_VERSION', 'dev'),
    canonicalOrigin: getEnvOptional('EXPO_PUBLIC_CANONICAL_ORIGIN', 'http://localhost:5173'),
    stripePublicKey: getEnvOptional('VITE_STRIPE_PUBLIC_KEY', ''),
  };
}

/**
 * Debug mode
 */
export const isDebugMode = () => getEnvBool('EXPO_PUBLIC_DEBUG', isLocal());

/**
 * Feature flags
 */
export function getFeatureFlags() {
  return {
    enableAnalytics: getEnvBool('EXPO_PUBLIC_ENABLE_ANALYTICS', isProd()),
    enableSentry: getEnvBool('EXPO_PUBLIC_ENABLE_SENTRY', isProd()),
    enableStripe: getEnvBool('EXPO_PUBLIC_ENABLE_STRIPE', false),
  };
}

/**
 * Validate that all required environment variables are set
 * Call this at app startup
 */
export function validateEnv(): void {
  const required = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
  ];

  const missing = required.filter(name => !readEnv(name));
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.join('\n')}\n\n` +
      `Please ensure these are set in your .env file or deployment configuration.`
    );
  }
}

/**
 * Get all environment variables (for debugging)
 * DO NOT use in production - may expose secrets
 */
export function getAllEnv(): Record<string, string> {
  if (isProd()) {
    throw new Error('getAllEnv() is not allowed in production');
  }
  
  const platform = detectPlatform();
  const env: EnvRecord = platform === 'vite' 
    ? (globalThis as any).import?.meta?.env || {}
    : (globalThis as any).process?.env || {};
    
  return Object.fromEntries(
    Object.entries(env).filter(([_, v]) => v !== undefined) as [string, string][]
  );
}
