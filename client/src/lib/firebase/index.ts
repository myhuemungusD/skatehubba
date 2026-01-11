/**
 * Firebase Module Public API
 * 
 * Clean exports for Firebase functionality.
 * Import from '@/lib/firebase' for all Firebase needs.
 * 
 * @module lib/firebase
 */

// Configuration & Instances
export { auth, db, app } from './config';

// Auth Service
export {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  getGoogleRedirectResult,
  signOutUser,
  onAuthStateChange,
  getCurrentUser,
  resendVerificationEmail,
} from './auth.service';

// Profile Service
export {
  getProfile,
  createProfile,
  updateProfile,
  getOrCreateProfile,
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
