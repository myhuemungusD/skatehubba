/**
 * Firebase Application Configuration
 * 
 * Single source of truth for Firebase initialization.
 * Follows Firebase best practices for web applications.
 * 
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

function getFirebaseConfig(): FirebaseConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  
  if (!apiKey || !projectId) {
    return null;
  }
  
  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
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
    
    if (!config) {
      initError = new Error('Firebase configuration missing');
      return false;
    }
    
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
    return true;
  } catch (error) {
    initError = error as Error;
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
