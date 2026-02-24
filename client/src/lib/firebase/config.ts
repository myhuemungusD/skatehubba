/**
 * Firebase Application Configuration
 *
 * Single source of truth for Firebase initialization.
 *
 * Reads env vars via import.meta.env directly rather than the cross-platform
 * @skatehubba/config adapter. The adapter checks globalThis.import?.meta?.env,
 * but `import` is a JS keyword — not a globalThis property — so that path is
 * always undefined in browsers. Vite only statically replaces direct
 * import.meta.env.* references at build time, making this the only reliable
 * approach for browser bundles.
 *
 * @see https://firebase.google.com/docs/projects/api-keys
 * @module lib/firebase/config
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, type Functions } from "firebase/functions";

import { assertEnvWiring, getAppEnv, getEnvBanner, isProd, isStaging } from "@skatehubba/config";
import { logger } from "../logger";

// ============================================================================
// Types
// ============================================================================

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

// ============================================================================
// Config Resolution
// Uses import.meta.env directly — Vite statically replaces these at build time
// with the values of EXPO_PUBLIC_FIREBASE_* from the build environment.
// ============================================================================

function getFirebaseConfig(): FirebaseConfig {
  const apiKey = import.meta.env.EXPO_PUBLIC_FIREBASE_API_KEY as string | undefined;
  const authDomain = import.meta.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN as string | undefined;
  const projectId = import.meta.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string | undefined;
  const storageBucket = import.meta.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string | undefined;
  const messagingSenderId = import.meta.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as
    | string
    | undefined;
  const appId = import.meta.env.EXPO_PUBLIC_FIREBASE_APP_ID as string | undefined;
  const measurementId = import.meta.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID as
    | string
    | undefined;

  if (!apiKey || !projectId || !appId) {
    const missing = (
      [
        !apiKey && "EXPO_PUBLIC_FIREBASE_API_KEY",
        !projectId && "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
        !appId && "EXPO_PUBLIC_FIREBASE_APP_ID",
      ] as (string | false)[]
    ).filter(Boolean) as string[];
    throw new Error(
      `[Firebase] Missing required environment variables: ${missing.join(", ")}. ` +
        "Set these in Vercel → Project → Settings → Environment Variables and redeploy."
    );
  }

  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket || `${projectId}.firebasestorage.app`,
    messagingSenderId: messagingSenderId || "",
    appId,
    measurementId,
  };
}

// ============================================================================
// Firebase Initialization (singleton)
// ============================================================================

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let functions: Functions;
let isFirebaseInitialized = false;

function initFirebase() {
  if (isFirebaseInitialized) return;

  // Run environment guardrails on startup
  try {
    assertEnvWiring();
  } catch (error) {
    logger.error("[Firebase] Environment mismatch detected!", error);
    if (isProd()) {
      throw error;
    }
  }

  let config: FirebaseConfig;
  try {
    config = getFirebaseConfig();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : "[Firebase] Failed to load config");
    // Don't throw — auth operations will surface auth/api-key-not-valid which
    // auth-errors.ts maps to a user-friendly message.
    return;
  }

  // L9: Only log Firebase config in true local development
  if (import.meta.env.DEV && typeof window !== "undefined" && window.location.hostname === "localhost") {
    const banner = getEnvBanner();
    logger.log(`[Firebase] ${banner}`);
    logger.log("[Firebase] Environment:", getAppEnv());
  }

  app = getApps().length ? getApp() : initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functions = getFunctions(app);

  isFirebaseInitialized = true;
}

// Initialize immediately on import (client-safe)
initFirebase();

// ============================================================================
// Public exports
// ============================================================================

/**
 * Set auth persistence mode.
 * @param rememberMe - If true, persists across browser restarts. If false, session only.
 */
async function setAuthPersistence(rememberMe: boolean): Promise<void> {
  try {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  } catch (error) {
    logger.error("[Firebase] Failed to set persistence:", error);
  }
}

export {
  app,
  auth,
  db,
  storage,
  functions,
  isFirebaseInitialized,
  getAppEnv,
  isProd,
  isStaging,
  setAuthPersistence,
};
