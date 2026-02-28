/// <reference types="vite/client" />

// ============================================================================
// EXPO_PUBLIC_ env var type declarations
//
// Every EXPO_PUBLIC_* var read via import.meta.env in client code must be
// declared here. This provides compile-time safety — if you typo a var name
// or use a VITE_ prefix instead of EXPO_PUBLIC_, TypeScript will flag it.
//
// Canonical contract: packages/config/src/envContract.ts
// ============================================================================
interface ImportMetaEnv {
  // Firebase
  readonly EXPO_PUBLIC_FIREBASE_API_KEY?: string;
  readonly EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  readonly EXPO_PUBLIC_FIREBASE_PROJECT_ID?: string;
  readonly EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  readonly EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly EXPO_PUBLIC_FIREBASE_APP_ID?: string;
  readonly EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID?: string;
  readonly EXPO_PUBLIC_FIREBASE_APP_ID_PROD?: string;
  readonly EXPO_PUBLIC_FIREBASE_APP_ID_STAGING?: string;
  readonly EXPO_PUBLIC_RECAPTCHA_SITE_KEY?: string;
  readonly EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN?: string;

  // App config
  readonly EXPO_PUBLIC_APP_ENV?: string;
  readonly EXPO_PUBLIC_API_BASE_URL?: string;
  readonly EXPO_PUBLIC_CANONICAL_ORIGIN?: string;
  readonly EXPO_PUBLIC_APP_VERSION?: string;
  readonly EXPO_PUBLIC_DEBUG?: string;

  // Payments & donations
  readonly EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  readonly EXPO_PUBLIC_DONATE_STRIPE_URL?: string;
  readonly EXPO_PUBLIC_DONATE_PAYPAL_URL?: string;

  // Monitoring
  readonly EXPO_PUBLIC_SENTRY_DSN?: string;

  // Feature flags
  readonly EXPO_PUBLIC_ENABLE_ANALYTICS?: string;
  readonly EXPO_PUBLIC_ENABLE_SENTRY?: string;
  readonly EXPO_PUBLIC_ENABLE_STRIPE?: string;

  // Build stamps (set by CI)
  readonly EXPO_PUBLIC_COMMIT_SHA?: string;
  readonly EXPO_PUBLIC_BUILD_TIME?: string;

  // E2E testing
  readonly EXPO_PUBLIC_E2E?: string;

  // Google OAuth (mobile)
  readonly EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
  readonly EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?: string;
  readonly EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Cypress E2E testing
interface Window {
  Cypress?: unknown;
  __SKATEHUBBA_UID__?: string | null;
}

// Asset imports handled by Vite
declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.css" {
  const css: string;
  export default css;
}

// Leaflet asset imports
declare module "leaflet/dist/images/*.png" {
  const src: string;
  export default src;
}

declare module "leaflet/dist/leaflet.css" {
  const css: string;
  export default css;
}
