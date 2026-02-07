/**
 * Firebase Module Public API
 * 
 * Clean exports for Firebase functionality.
 * Import from '@/lib/firebase' for all Firebase needs.
 * 
 * @module lib/firebase
 */

// Configuration & Instances
export { app, auth, db, isFirebaseInitialized, setAuthPersistence } from './config';

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
