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
  auth,
  db,
  functions,
  isFirebaseInitialized,
} from "./firebase/config";

// Analytics placeholder - can be implemented with Firebase Analytics if needed
const analytics = null;

export { firebaseApp as app, auth, db, functions, analytics, isFirebaseInitialized };
