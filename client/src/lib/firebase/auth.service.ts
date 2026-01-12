/**
 * Authentication Service
 * 
 * Production-grade authentication operations using Firebase Auth.
 * Handles all auth flows: email/password, Google OAuth, and session management.
 * 
 * Design Principles:
 * - Single responsibility: Each function does one thing well
 * - Explicit error handling: All errors are caught and transformed
 * - Type safety: Full TypeScript coverage
 * - No side effects: Pure functions where possible
 * 
 * @module lib/firebase/auth.service
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
  Unsubscribe,
} from 'firebase/auth';
import { auth as getAuth } from './config';
import { AuthUser, AuthError, AuthErrorCode } from './auth.types';
import { toAuthUser } from './auth.types';

// ============================================================================
// Error Handling
// ============================================================================

const ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/popup-blocked': 'Pop-up blocked. Please allow pop-ups and try again.',
  'auth/account-exists-with-different-credential': 
    'An account already exists with this email using a different sign-in method.',
  'auth/requires-recent-login': 'Please sign in again to complete this action.',
};

/**
 * Transform Firebase errors into structured AuthError objects
 */
function createAuthError(error: unknown): AuthError {
  console.error('[AuthService] Auth error:', error);
  const firebaseError = error as { code?: string; message?: string };
  const code = (firebaseError.code as AuthErrorCode) || 'unknown';
  const message = ERROR_MESSAGES[code] || firebaseError.message || 'An unexpected error occurred.';
  
  console.error('[AuthService] Mapped error:', { code, message });
  return { code, message, originalError: error };
}

// ============================================================================
// Email/Password Authentication
// ============================================================================

/**
 * Register a new user with email and password
 * 
 * @param email - User's email address
 * @param password - User's password (min 6 characters)
 * @param profile - Optional profile data (firstName, lastName)
 * @returns The created user
 * @throws AuthError if registration fails
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  profile?: { firstName?: string; lastName?: string }
): Promise<AuthUser> {
  const auth = getAuth();
  console.log('[AuthService] signUpWithEmail called with:', { email, profile });
  console.log('[AuthService] Auth instance:', auth ? 'exists' : 'NULL');
  
  try {
    console.log('[AuthService] Calling createUserWithEmailAndPassword...');
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    console.log('[AuthService] Sign up successful, user:', credential.user.uid);
    const user = credential.user;
    
    // Set display name if provided
    const displayName = [profile?.firstName, profile?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    
    if (displayName) {
      await updateProfile(user, { displayName });
    }
    
    // Send verification email
    await sendEmailVerification(user);
    
    return toAuthUser(user);
  } catch (error) {
    throw createAuthError(error);
  }
}

/**
 * Sign in an existing user with email and password
 * 
 * @param email - User's email address
 * @param password - User's password
 * @returns The authenticated user
 * @throws AuthError if sign-in fails
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthUser> {
  const auth = getAuth();
  console.log('[AuthService] Attempting sign in for:', email);
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    console.log('[AuthService] Sign in successful for:', credential.user.uid);
    return toAuthUser(credential.user);
  } catch (error) {
    console.error('[AuthService] Sign in failed:', error);
    throw createAuthError(error);
  }
}

// ============================================================================
// Google OAuth Authentication
// ============================================================================

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Detect if running on mobile device
 */
function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Sign in with Google OAuth
 * Uses popup on desktop, redirect on mobile for better UX
 * 
 * @returns The authenticated user, or null if redirect was triggered
 * @throws AuthError if sign-in fails
 */
export async function signInWithGoogle(): Promise<AuthUser | null> {
  const auth = getAuth();
  try {
    if (isMobileDevice()) {
      // Mobile: Use redirect flow
      await signInWithRedirect(auth, googleProvider);
      return null; // Will be handled by getGoogleRedirectResult
    }
    
    // Desktop: Try popup first
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return toAuthUser(result.user);
    } catch (popupError) {
      const error = popupError as { code?: string };
      
      // Fall back to redirect if popup is blocked
      if (error.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
      
      throw popupError;
    }
  } catch (error) {
    throw createAuthError(error);
  }
}

/**
 * Handle Google redirect result
 * Call this on app initialization to handle redirect results
 * 
 * @returns The authenticated user if redirect succeeded, null otherwise
 */
export async function getGoogleRedirectResult(): Promise<AuthUser | null> {
  const auth = getAuth();
  try {
    const result = await getRedirectResult(auth);
    return result ? toAuthUser(result.user) : null;
  } catch (error) {
    throw createAuthError(error);
  }
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Sign out the current user
 * 
 * @throws AuthError if sign-out fails
 */
export async function signOutUser(): Promise<void> {
  const auth = getAuth();
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    throw createAuthError(error);
  }
}

/**
 * Subscribe to authentication state changes
 * 
 * @param callback - Function called when auth state changes
 * @returns Unsubscribe function
 */
export function onAuthStateChange(
  callback: (user: AuthUser | null) => void
): Unsubscribe {
  const auth = getAuth();
  return onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
    callback(firebaseUser ? toAuthUser(firebaseUser) : null);
  });
}

/**
 * Get the current authenticated user
 * 
 * @returns Current user or null if not authenticated
 */
export function getCurrentUser(): AuthUser | null {
  const auth = getAuth();
  return auth.currentUser ? toAuthUser(auth.currentUser) : null;
}

/**
 * Send password reset email
 * 
 * @param email - User's email address
 * @throws AuthError if sending fails
 */
export async function resetPassword(email: string): Promise<void> {
  const auth = getAuth();
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    throw createAuthError(error);
  }
}

/**
 * Resend email verification
 * 
 * @throws AuthError if sending fails
 */
export async function resendVerificationEmail(): Promise<void> {
  const auth = getAuth();
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in.');
    }
    await sendEmailVerification(user);
  } catch (error) {
    throw createAuthError(error);
  }
}
