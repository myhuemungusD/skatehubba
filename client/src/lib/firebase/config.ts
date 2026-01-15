/**
 * Firebase Application Configuration
 *
 * Single source of truth for Firebase initialization.
 * Uses Vite environment variables and fails fast if misconfigured.
 *
 * Firebase API keys are safe to expose in client code.
 * Security is enforced via Firebase Security Rules.
 *
 * @see https://firebase.google.com/docs/projects/api-keys
 * @module lib/firebase/config
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

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
// Config Resolution (env-only, fail fast)
// ============================================================================

function getFirebaseConfig(): FirebaseConfig {
  const config: FirebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  if (import.meta.env.DEV) {
    console.log(
      "[Firebase] Config source:",
      config.apiKey ? "Environment variables" : "MISSING ENV VARS"
    );

    if (!config.apiKey || !config.projectId) {
      console.warn(
        "[Firebase] Missing required Firebase env vars (VITE_FIREBASE_*)"
      );
    }
  }

  if (!config.apiKey || !config.projectId) {
    throw new Error(
      "Firebase config is incomplete. Check VITE_FIREBASE_* environment variables."
    );
  }

  return config;
}

// ============================================================================
// Firebase Initialization (singleton)
// ============================================================================

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;
let isFirebaseInitialized = false;

function initFirebase() {
  if (isFirebaseInitialized) return;

  const config = getFirebaseConfig();

  app = getApps().length ? getApp() : initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app);

  isFirebaseInitialized = true;
}

// Initialize immediately on import (client-safe)
initFirebase();

// ============================================================================
// Public exports
// ============================================================================

export { app, auth, db, functions, isFirebaseInitialized };
