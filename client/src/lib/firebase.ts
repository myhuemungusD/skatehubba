/**
 * Firebase Module - Re-exports from canonical config
 * 
 * This file re-exports from the single source of truth for Firebase configuration.
 * All components should import Firebase services from here or from './firebase/config'.
 * 
 * DO NOT add a separate Firebase initialization here - it causes duplicate app errors
 * and config conflicts.
 * 
 * @module lib/firebase
 */

import { 
  app as firebaseApp,
  auth as getAuthInstance, 
  db as getDbInstance, 
  functions as getFunctionsInstance,
  isFirebaseInitialized 
} from './firebase/config';

// Get instances by calling the getter functions
const auth = getAuthInstance();
const db = getDbInstance();
const functions = getFunctionsInstance();

// Analytics placeholder - can be implemented with Firebase Analytics if needed
const analytics = null;

export { firebaseApp as app, auth, db, functions, analytics, isFirebaseInitialized };
