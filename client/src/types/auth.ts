/**
 * Authentication Types
 * Strict TypeScript definitions for the auth system
 */

/**
 * User profile stored in Firestore /users/{uid}
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Auth state managed by AuthContext
 */
export interface AuthState {
  /** Firebase User object or null if not authenticated */
  firebaseUser: FirebaseUserData | null;
  /** User profile from Firestore */
  userProfile: UserProfile | null;
  /** True while auth state is being determined */
  isLoading: boolean;
  /** Error message if auth operation failed */
  error: string | null;
}

/**
 * Minimal Firebase user data we need
 */
export interface FirebaseUserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

/**
 * Auth context value with state and actions
 */
export interface AuthContextValue extends AuthState {
  /** Sign up with email and password */
  signUp: (email: string, password: string) => Promise<void>;
  /** Sign in with email and password */
  signIn: (email: string, password: string) => Promise<void>;
  /** Sign in with Google */
  signInWithGoogle: () => Promise<void>;
  /** Sign out the current user */
  signOut: () => Promise<void>;
  /** Whether user is authenticated (has verified email or provider auth) */
  isAuthenticated: boolean;
}

/**
 * Error codes from Firebase Auth
 */
export type FirebaseAuthErrorCode =
  | 'auth/email-already-in-use'
  | 'auth/invalid-email'
  | 'auth/operation-not-allowed'
  | 'auth/weak-password'
  | 'auth/user-disabled'
  | 'auth/user-not-found'
  | 'auth/wrong-password'
  | 'auth/too-many-requests'
  | 'auth/network-request-failed';

/**
 * Structured auth error
 */
export interface AuthError {
  code: FirebaseAuthErrorCode | string;
  message: string;
}
