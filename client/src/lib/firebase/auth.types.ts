/**
 * Authentication Types
 * 
 * Type definitions for the authentication system.
 * All types are strictly defined for type safety.
 * 
 * @module lib/firebase/auth.types
 */

import { User as FirebaseUser } from 'firebase/auth';

// ============================================================================
// User Types
// ============================================================================

/**
 * Minimal user data extracted from Firebase Auth
 * Contains only serializable, essential information
 */
export interface AuthUser {
  readonly uid: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly photoURL: string | null;
  readonly emailVerified: boolean;
  readonly isAnonymous: boolean;
}

/**
 * User profile stored in Firestore
 * Extended user information persisted in database
 */
export interface UserProfile {
  readonly uid: string;
  readonly username: string;
  readonly stance: "regular" | "goofy" | null;
  readonly experienceLevel: "beginner" | "intermediate" | "advanced" | "pro" | null;
  readonly favoriteTricks: string[];
  readonly bio: string | null;
  readonly spotsVisited: number;
  readonly crewName: string | null;
  readonly credibilityScore: number;
  readonly avatarUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input for creating a new user profile
 */
export interface CreateProfileInput {
  username: string;
  stance?: "regular" | "goofy";
  experienceLevel?: "beginner" | "intermediate" | "advanced" | "pro";
  favoriteTricks?: string[];
  bio?: string | null;
  crewName?: string | null;
  avatarUrl?: string | null;
}

// ============================================================================
// Auth State Types
// ============================================================================

/**
 * Authentication state for the application
 */
export interface AuthState {
  /** Current authenticated user (null if not authenticated) */
  user: AuthUser | null;
  /** User profile from Firestore (null if not loaded or not authenticated) */
  profile: UserProfile | null;
  /** Whether auth state is being determined */
  isLoading: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Current error message (null if no error) */
  error: string | null;
}

/**
 * Authentication context value
 * Provides auth state and actions to the application
 */
export interface AuthContextValue extends AuthState {
  /** Sign up with email and password */
  signUp: (email: string, password: string, profile?: { firstName?: string; lastName?: string }) => Promise<void>;
  /** Sign in with email and password */
  signIn: (email: string, password: string) => Promise<void>;
  /** Sign in with Google OAuth */
  signInWithGoogle: () => Promise<void>;
  /** Sign in anonymously as guest */
  signInAnonymously: () => Promise<void>;
  /** Sign out current user */
  signOut: () => Promise<void>;
  /** Send password reset email */
  resetPassword: (email: string) => Promise<void>;
  /** Clear current error */
  clearError: () => void;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Authentication error codes
 */
export type AuthErrorCode =
  | 'auth/email-already-in-use'
  | 'auth/invalid-email'
  | 'auth/operation-not-allowed'
  | 'auth/weak-password'
  | 'auth/user-disabled'
  | 'auth/user-not-found'
  | 'auth/wrong-password'
  | 'auth/invalid-credential'
  | 'auth/too-many-requests'
  | 'auth/network-request-failed'
  | 'auth/popup-closed-by-user'
  | 'auth/popup-blocked'
  | 'auth/account-exists-with-different-credential'
  | 'auth/requires-recent-login'
  | 'unknown';

/**
 * Structured authentication error
 */
export interface AuthError {
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly originalError?: unknown;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Convert Firebase User to AuthUser
 */
export function toAuthUser(firebaseUser: FirebaseUser): AuthUser {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    emailVerified: firebaseUser.emailVerified,
    isAnonymous: firebaseUser.isAnonymous,
  };
}
