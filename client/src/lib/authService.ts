/**
 * Auth Service
 * Firebase Authentication operations for email/password auth with Firestore profile management
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  User,
  Unsubscribe
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, FirebaseUserData, AuthError } from '../types/auth';

/**
 * Check if we're running in mock Firebase mode
 */
function isMockMode(): boolean {
  return !!(auth as unknown as { _isMock?: boolean })?._isMock;
}

/**
 * Convert Firebase User to our minimal FirebaseUserData
 */
export function toFirebaseUserData(user: User): FirebaseUserData {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified
  };
}

/**
 * Map Firebase error codes to user-friendly messages
 */
function mapAuthError(error: unknown): AuthError {
  const firebaseError = error as { code?: string; message?: string };
  const code = firebaseError.code ?? 'unknown';
  
  // Log the raw error for debugging
  console.error('[AuthService] Firebase auth error:', code, firebaseError.message);
  
  const errorMessages: Record<string, string> = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Pop-up was blocked. Please allow pop-ups and try again.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Authentication service configuration error. Please contact support.',
    'auth/api-key-not-valid': 'Authentication service configuration error. Please contact support.',
    'auth/invalid-api-key': 'Authentication service configuration error. Please contact support.',
  };
  
  return {
    code,
    message: errorMessages[code] ?? firebaseError.message ?? 'An unexpected error occurred.'
  };
}

/**
 * Create a user profile document in Firestore
 */
export async function createUserProfile(
  uid: string,
  email: string,
  displayName?: string
): Promise<UserProfile> {
  const userProfile: UserProfile = {
    uid,
    email,
    displayName: displayName ?? email.split('@')[0],
    photoURL: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const userDocRef = doc(db, 'users', uid);
  
  await setDoc(userDocRef, {
    uid: userProfile.uid,
    email: userProfile.email,
    displayName: userProfile.displayName,
    photoURL: userProfile.photoURL,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return userProfile;
}

/**
 * Fetch user profile from Firestore
 */
export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  if (isMockMode()) {
    // Return mock profile in mock mode
    return {
      uid,
      email: 'mock@skatehubba.com',
      displayName: 'Mock User',
      photoURL: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  const userDocRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userDocRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  const data = snapshot.data();
  
  return {
    uid: data.uid as string,
    email: data.email as string,
    displayName: data.displayName as string,
    photoURL: (data.photoURL as string) ?? null,
    createdAt: data.createdAt instanceof Timestamp 
      ? data.createdAt.toDate() 
      : new Date(data.createdAt as string),
    updatedAt: data.updatedAt instanceof Timestamp 
      ? data.updatedAt.toDate() 
      : new Date(data.updatedAt as string)
  };
}

/**
 * Sign up a new user with email and password
 * Creates Firebase Auth user and Firestore profile
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ firebaseUser: FirebaseUserData; userProfile: UserProfile }> {
  try {
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = toFirebaseUserData(userCredential.user);
    
    // Create Firestore profile
    const userProfile = await createUserProfile(firebaseUser.uid, email);
    
    return { firebaseUser, userProfile };
  } catch (error) {
    const authError = mapAuthError(error);
    throw new Error(authError.message);
  }
}

/**
 * Sign in an existing user with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ firebaseUser: FirebaseUserData; userProfile: UserProfile }> {
  try {
    // Sign in with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = toFirebaseUserData(userCredential.user);
    
    // Fetch existing profile
    let userProfile = await fetchUserProfile(firebaseUser.uid);
    
    // If profile doesn't exist (edge case), create one
    if (!userProfile) {
      userProfile = await createUserProfile(firebaseUser.uid, email);
    }
    
    return { firebaseUser, userProfile };
  } catch (error) {
    const authError = mapAuthError(error);
    throw new Error(authError.message);
  }
}

/**
 * Sign in with Google
 * Creates Firestore profile if it doesn't exist
 */
export async function signInWithGoogle(): Promise<{ firebaseUser: FirebaseUserData; userProfile: UserProfile }> {
  try {
    // Handle mock mode for Google Sign-In
    if (isMockMode()) {
      console.log('[AuthService] Mock mode detected - using mock Google sign-in');
      const mockAuth = auth as unknown as { 
        signInWithPopup: () => Promise<{ user: User }> 
      };
      const result = await mockAuth.signInWithPopup();
      const firebaseUser = toFirebaseUserData(result.user);
      
      // Create mock profile
      const userProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? 'google@skatehubba.com',
        displayName: firebaseUser.displayName ?? 'Google User',
        photoURL: firebaseUser.photoURL,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      return { firebaseUser, userProfile };
    }
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    // Check if mobile - use redirect for better UX
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    let userCredential;
    
    if (isMobile) {
      // For mobile, use redirect flow
      await signInWithRedirect(auth, provider);
      // This will redirect away, so we return a placeholder
      // The actual result is handled by handleGoogleRedirect
      return { 
        firebaseUser: { uid: '', email: null, displayName: null, photoURL: null, emailVerified: false },
        userProfile: { uid: '', email: '', displayName: '', photoURL: null, createdAt: new Date(), updatedAt: new Date() }
      };
    } else {
      // For desktop, try popup first
      try {
        userCredential = await signInWithPopup(auth, provider);
      } catch (popupError: unknown) {
        const error = popupError as { code?: string };
        // If popup blocked, fall back to redirect
        if (error.code === 'auth/popup-blocked') {
          await signInWithRedirect(auth, provider);
          return { 
            firebaseUser: { uid: '', email: null, displayName: null, photoURL: null, emailVerified: false },
            userProfile: { uid: '', email: '', displayName: '', photoURL: null, createdAt: new Date(), updatedAt: new Date() }
          };
        }
        throw popupError;
      }
    }
    
    const firebaseUser = toFirebaseUserData(userCredential.user);
    
    // Fetch or create profile
    let userProfile = await fetchUserProfile(firebaseUser.uid);
    
    if (!userProfile) {
      userProfile = await createUserProfile(
        firebaseUser.uid,
        firebaseUser.email ?? '',
        firebaseUser.displayName ?? undefined
      );
    }
    
    return { firebaseUser, userProfile };
  } catch (error) {
    const authError = mapAuthError(error);
    throw new Error(authError.message);
  }
}

/**
 * Handle Google redirect result (for mobile or popup-blocked scenarios)
 */
export async function handleGoogleRedirectResult(): Promise<{ firebaseUser: FirebaseUserData; userProfile: UserProfile } | null> {
  try {
    if (isMockMode()) {
      return null;
    }
    
    const result = await getRedirectResult(auth);
    
    if (!result) {
      return null;
    }
    
    const firebaseUser = toFirebaseUserData(result.user);
    
    // Fetch or create profile
    let userProfile = await fetchUserProfile(firebaseUser.uid);
    
    if (!userProfile) {
      userProfile = await createUserProfile(
        firebaseUser.uid,
        firebaseUser.email ?? '',
        firebaseUser.displayName ?? undefined
      );
    }
    
    return { firebaseUser, userProfile };
  } catch (error) {
    const authError = mapAuthError(error);
    throw new Error(authError.message);
  }
}

/**
 * Sign out the current user
 */
export async function signOutUser(): Promise<void> {
  try {
    if (isMockMode()) {
      await (auth as unknown as { signOut: () => Promise<void> }).signOut();
    } else {
      await firebaseSignOut(auth);
    }
  } catch (error) {
    const authError = mapAuthError(error);
    throw new Error(authError.message);
  }
}

/**
 * Subscribe to auth state changes
 */
export function subscribeToAuthState(
  callback: (user: User | null) => void
): Unsubscribe {
  if (isMockMode()) {
    // Handle mock mode auth state subscription
    const mockAuth = auth as unknown as { 
      onAuthStateChanged: (cb: (user: User | null) => void) => () => void 
    };
    return mockAuth.onAuthStateChanged(callback);
  }
  
  return onAuthStateChanged(auth, callback);
}
