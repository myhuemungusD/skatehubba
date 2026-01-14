/**
 * Firebase Application Configuration
 * 
 * Single source of truth for Firebase initialization.
 * Follows Firebase best practices for web applications.
 * 
 * BULLETPROOF CONFIG: Hardcoded production values with env var overrides.
 * Firebase API keys are safe to expose in client code - security is enforced
 * via Firebase Security Rules, not by hiding the API key.
 * 
 * @see https://firebase.google.com/docs/projects/api-keys
 * @module lib/firebase/config
 */

import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  connectAuthEmulator,
  Auth 
} from 'firebase/auth';
import { 
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
} from 'firebase/firestore';
import {
  getFunctions,
  connectFunctionsEmulator,
  Functions,
} from 'firebase/functions';

// ============================================================================
// HARDCODED PRODUCTION CONFIG (Bulletproof - always works)
// ============================================================================
// These are PUBLIC values - Firebase security comes from Security Rules, not hiding keys
// See: https://firebase.google.com/docs/projects/api-keys#api-keys-for-firebase-are-different

const PRODUCTION_CONFIG = {
  apiKey: 'AIzaSyD6kLt4GKV4adX-oQ3m_aXIpL6GXBP0xZw',
  authDomain: 'sk8hub-d7806.firebaseapp.com',
  projectId: 'sk8hub-d7806',
  storageBucket: 'sk8hubd7806.firebasestorage.app',
  messagingSenderId: '665573979824',
  appId: '1:665573979824:web:731aaae46daea5efee2d75',
  measurementId: 'G-7XVNF1LHZW',
} as const;

// ============================================================================
// Configuration
// ============================================================================

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

function getFirebaseConfig(): FirebaseConfig {
  // Allow env vars to override hardcoded config (useful for different environments)
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || PRODUCTION_CONFIG.apiKey;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || PRODUCTION_CONFIG.projectId;
  
  // Log config source in development
  if (import.meta.env.DEV) {
    const usingEnv = !!import.meta.env.VITE_FIREBASE_API_KEY;
    console.log('[Firebase] Config source:', usingEnv ? 'Environment variables' : 'Hardcoded production config');
    console.log('[Firebase] Project ID:', projectId);
    console.log('[Firebase] API key starts with:', apiKey.substring(0, 8) + '...');
  }
  
  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || PRODUCTION_CONFIG.authDomain,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || PRODUCTION_CONFIG.storageBucket,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || PRODUCTION_CONFIG.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || PRODUCTION_CONFIG.appId,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || PRODUCTION_CONFIG.measurementId,
  };
}

// ============================================================================
// Initialization
// ============================================================================

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let initialized = false;
let initError: Error | null = null;

function initializeFirebase(): boolean {
  if (initialized) return true;
  if (initError) return false;
  
  try {
    const config = getFirebaseConfig();
    
    // Config is now always valid (hardcoded fallback)
    console.log('[Firebase] Initializing with project:', config.projectId);
    
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);
    
    // Connect to emulators in development if configured
    if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, 'localhost', 8080);
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    
    initialized = true;
    console.log('[Firebase] ✅ Initialization complete');
    return true;
  } catch (error) {
    initError = error as Error;
    console.error('[Firebase] ❌ Initialization failed:', initError.message);
    return false;
  }
}

// Initialize immediately on module load
initializeFirebase();

// ============================================================================
// Exports
// ============================================================================

/**
 * Get Firebase Auth instance (throws if not initialized)
 */
function getAuthInstance(): Auth {
  if (!auth) {
    initializeFirebase();
    if (!auth) {
      throw new Error('Firebase Auth not initialized. Check your environment variables.');
    }
  }
  return auth;
}

/**
 * Get Firestore instance (throws if not initialized)
 */
function getDbInstance(): Firestore {
  if (!db) {
    initializeFirebase();
    if (!db) {
      throw new Error('Firestore not initialized. Check your environment variables.');
    }
  }
  return db;
}

/**
 * Get Functions instance (throws if not initialized)
 */
function getFunctionsInstance(): Functions {
  if (!functions) {
    initializeFirebase();
    if (!functions) {
      throw new Error('Firebase Functions not initialized. Check your environment variables.');
    }
  }
  return functions;
}

/**
 * Check if Firebase is properly initialized
 */
export function isFirebaseInitialized(): boolean {
  return initialized && auth !== null && db !== null && functions !== null;
}

export { app, getAuthInstance as auth, getDbInstance as db, getFunctionsInstance as functions };
export type { FirebaseApp, Auth, Firestore, Functions };
