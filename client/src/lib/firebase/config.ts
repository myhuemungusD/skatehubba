/**
 * Firebase Application Configuration
 *
 * Single source of truth for Firebase initialization.
 * 
 * BULLETPROOF CONFIG: Contains hardcoded production values as fallback.
 * Firebase API keys are safe to expose - security is handled via Firebase Security Rules.
 *
 * @see https://firebase.google.com/docs/projects/api-keys
 * @module lib/firebase/config
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

// ============================================================================
// HARDCODED PRODUCTION CONFIG (Bulletproof fallback)
// ============================================================================
// Firebase API keys are PUBLIC by design - security is via Firebase Security Rules
// This ensures the app works even if Vercel env vars aren't properly set
const PRODUCTION_CONFIG = {
  apiKey: 'AIzaSyD6kLt4GKV4adX-oQ3m_aXIpL6GXBP0xZw',
  authDomain: 'sk8hub-d7806.firebaseapp.com',
  projectId: 'sk8hub-d7806',
  storageBucket: 'sk8hub-d7806.firebasestorage.app',
  messagingSenderId: '665573979824',
  appId: '1:665573979824:web:731aaae46daea5efee2d75',
  measurementId: 'G-7XVNF1LHZW',
};

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
// Config Resolution (with hardcoded fallback)
// ============================================================================

function getFirebaseConfig(): FirebaseConfig {
  // Try environment variables first
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  // If env vars are missing, use hardcoded production config
  if (!apiKey || !projectId) {
    console.warn('[Firebase] Environment variables missing, using hardcoded production config');
    return PRODUCTION_CONFIG;
  }

  // Log partial key for debugging (first 8 chars only)
  if (import.meta.env.DEV) {
    console.log('[Firebase] Config loaded, API key starts with:', apiKey.substring(0, 8) + '...');
    console.log('[Firebase] Project ID:', projectId);
  }

  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || PRODUCTION_CONFIG.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || PRODUCTION_CONFIG.appId,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
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
