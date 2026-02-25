/**
 * Firebase App Check
 *
 * App Check verifies that incoming requests originate from a genuine
 * installation of the SkateHubba app, protecting the backend API and
 * Firebase services from abuse by unauthorized clients.
 *
 * Platform attestation providers:
 * - iOS: DeviceCheck (production) or App Attest (iOS 14+)
 * - Android: Play Integrity (production)
 * - Debug: Debug provider with a registered debug token
 *
 * This module uses the Firebase JS SDK's App Check, which supports
 * custom providers. The actual attestation is handled by the native
 * platform APIs via the custom provider implementation.
 *
 * Setup requirements:
 * 1. Enable App Check in Firebase Console
 * 2. Register your app with the appropriate attestation provider
 * 3. Set EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN for development builds
 * 4. Enable server-side App Check verification (see server/middleware/appCheck.ts)
 *
 * @see https://firebase.google.com/docs/app-check
 */

import { initializeAppCheck, CustomProvider, type AppCheck, getToken } from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";
import { getAppEnv, getEnvOptional } from "@skatehubba/config";

let appCheckInstance: AppCheck | null = null;

/**
 * Initialize Firebase App Check.
 *
 * Must be called after Firebase app initialization and before any
 * Firebase service calls or API requests that require App Check tokens.
 *
 * In debug/development builds, uses a debug provider with a pre-registered
 * token. In production, uses a custom provider that the build pipeline
 * configures with the appropriate native attestation.
 *
 * @param firebaseApp - The initialized Firebase app instance. Passed
 *   explicitly to avoid a circular dependency with firebase.config.ts.
 */
export function initAppCheck(firebaseApp: FirebaseApp): void {
  if (appCheckInstance) return;

  const env = getAppEnv();

  try {
    if (env === "local") {
      // Development: use debug provider
      // The debug token must be registered in Firebase Console >
      // App Check > Apps > Manage debug tokens
      const debugToken = getEnvOptional("EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN");

      if (debugToken) {
        // Enable the debug provider by setting the global flag that
        // the Firebase SDK checks internally.
        const g = globalThis as Record<string, unknown>;
        g.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
      }

      appCheckInstance = initializeAppCheck(firebaseApp, {
        provider: new CustomProvider({
          getToken: async () => {
            // In development, return a debug token that Firebase Console
            // has been configured to accept.
            return {
              token: debugToken || "debug-token-not-configured",
              expireTimeMillis: Date.now() + 60 * 60 * 1000, // 1 hour
            };
          },
        }),
        isTokenAutoRefreshEnabled: false,
      });

      if (__DEV__) {
        // eslint-disable-next-line no-console -- startup diagnostic emitted only in local/debug builds; confirms which App Check provider is active
        console.log("[AppCheck] Initialized with debug provider");
      }
    } else {
      // Production and staging: use a custom provider that integrates
      // with the native attestation APIs.
      //
      // For full native attestation (DeviceCheck/Play Integrity), the
      // app must be built with the appropriate native modules. When
      // those are not available (e.g. Expo Go), the custom provider
      // returns an empty token that the server can handle via its
      // APP_CHECK_MODE setting (monitor → warn → enforce).
      appCheckInstance = initializeAppCheck(firebaseApp, {
        provider: new CustomProvider({
          getToken: async () => {
            // The native attestation token is obtained through the
            // platform-specific API. In a bare React Native build,
            // this would call the native module. In Expo managed
            // workflow, this requires an Expo config plugin for
            // the native attestation SDK.
            //
            // Placeholder: signal to the server that App Check is
            // configured but native attestation is not yet available.
            // Replace with actual native attestation when migrating
            // to a bare or custom dev client build.
            return {
              token: "",
              expireTimeMillis: Date.now() + 30 * 60 * 1000,
            };
          },
        }),
        isTokenAutoRefreshEnabled: true,
      });

      if (__DEV__) {
        // eslint-disable-next-line no-console -- startup diagnostic guarded by __DEV__; confirms App Check is active in non-production builds
        console.log(`[AppCheck] Initialized for ${env}`);
      }
    }
  } catch (error) {
    // App Check initialization failures should not crash the app.
    // The server should enforce App Check as a soft requirement
    // initially, becoming strict once all clients are updated.
    if (__DEV__) {
      console.error("[AppCheck] Initialization failed:", error);
    }
  }
}

/**
 * Get a current App Check token for use in API requests.
 *
 * Returns undefined if App Check is not initialized or token
 * retrieval fails. Callers should treat a missing token as
 * acceptable (the server decides whether to enforce).
 */
export async function getAppCheckToken(): Promise<string | undefined> {
  if (!appCheckInstance) return undefined;

  try {
    const result = await getToken(appCheckInstance, /* forceRefresh */ false);
    return result.token || undefined;
  } catch {
    // Token retrieval failure is non-fatal. The server may still
    // accept the request without an App Check token (during rollout).
    return undefined;
  }
}

/**
 * Get the App Check instance (for Firebase SDK internal use).
 */
export function getAppCheckInstance(): AppCheck | null {
  return appCheckInstance;
}
