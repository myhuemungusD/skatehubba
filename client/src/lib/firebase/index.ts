/**
 * Firebase Module Public API
 * 
 * Clean exports for Firebase functionality.
 * Import from '@/lib/firebase' for all Firebase needs.
 * 
 * @module lib/firebase
 */

// Configuration & Instances
export { app, auth, db, isFirebaseInitialized } from './config';

// Auth Service
export {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signInAnonymously,
  getGoogleRedirectResult,
  signOutUser,
  onAuthStateChange,
  getCurrentUser,
  resendVerificationEmail,
  resetPassword,
  setAuthPersistence,
} from './auth.service';

// Profile Service
export {
  getProfile,
  updateProfile,
} from './profile.service';

// Types
export {
  toAuthUser,
} from './auth.types';

export type {
  AuthUser,
  UserProfile,
  CreateProfileInput,
  AuthState,
  AuthContextValue,
  AuthError,
  AuthErrorCode,
} from './auth.types';
