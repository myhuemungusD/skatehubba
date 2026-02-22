/**
 * Firebase Application Configuration
 *
 * Single source of truth for Firebase initialization.
 *
 * ENTERPRISE CONFIG: Uses @skatehubba/config for universal env vars
 * that work across web (Vite) and mobile (Metro/Expo).
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

// Import from enterprise config package
import {
  getFirebaseConfig as getSharedFirebaseConfig,
  assertEnvWiring,
  getAppEnv,
  getEnvBanner,
  isProd,
  isStaging,
} from "@skatehubba/config";
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
// Config Resolution (via @skatehubba/config)
// ============================================================================

function getFirebaseConfig(): FirebaseConfig {
  return getSharedFirebaseConfig();
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
    // In production, fail hard. In dev, just warn.
    if (isProd()) {
      throw error;
    }
  }

  const config = getFirebaseConfig();

  // Guard: detect CI placeholder baked into bundle at build time.
  // This happens when EXPO_PUBLIC_FIREBASE_* vars are missing from the
  // deployment build environment (e.g. Vercel project settings).
  if (config.apiKey === "CI_PLACEHOLDER" || config.projectId === "ci-placeholder") {
    const msg =
      "[Firebase] App was built without Firebase environment variables. " +
      "Add EXPO_PUBLIC_FIREBASE_API_KEY and all other EXPO_PUBLIC_FIREBASE_* variables " +
      "to your deployment environment (e.g. Vercel project settings) and redeploy. " +
      "See .env.example for the full list of required variables.";
    logger.error(msg);
    // Don't throw — throwing here crashes the module and gives a worse error.
    // Firebase SDK will surface auth/api-key-not-valid, which auth-errors.ts maps
    // to a helpful user-facing message.
    return;
  }

  // Log environment info in dev
  if (!isProd()) {
    const banner = getEnvBanner();
    logger.log(`[Firebase] ${banner}`);
    logger.log("[Firebase] Environment:", getAppEnv());
    logger.log("[Firebase] Project ID:", config.projectId);
    logger.log("[Firebase] App ID:", config.appId.substring(0, 30) + "...");
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
