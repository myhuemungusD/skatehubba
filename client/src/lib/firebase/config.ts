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
  Firestore 
} from 'firebase/firestore';

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
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  
  if (!apiKey || !projectId) {
    throw new Error(
      '[Firebase] Missing required configuration. ' +
      'Ensure VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID are set in .env'
    );
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

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let initialized = false;

function initializeFirebase(): void {
  if (initialized) return;
  
  try {
    const config = getFirebaseConfig();
    
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // Connect to emulators in development if configured
    if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, 'localhost', 8080);
      console.info('[Firebase] Connected to emulators');
    }
    
    initialized = true;
    console.info('[Firebase] Initialized successfully for project:', config.projectId);
  } catch (error) {
    console.error('[Firebase] Initialization failed:', error);
    throw error;
  }
}

// Initialize immediately on module load
initializeFirebase();

// ============================================================================
// Exports
// ============================================================================

export { app, auth, db };
export type { FirebaseApp, Auth, Firestore };
