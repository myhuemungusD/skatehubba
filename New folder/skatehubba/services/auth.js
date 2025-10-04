import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from './firebase';
import { ROLES } from '../utils/roles';

// Error message mapping
export const AUTH_ERROR_MESSAGES = {
  'auth/user-not-found': 'No account found with this email. Please check your email or sign up.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-email': 'The email address is not valid.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/email-already-in-use': 'This email is already in use. Please sign in or use a different email.',
  'auth/weak-password': 'Password should be at least 6 characters long.',
  'auth/operation-not-allowed': 'This operation is not allowed. Please contact support.',
  'auth/network-request-failed': 'Network error. Please check your internet connection.',
  'auth/invalid-credential': 'Invalid credentials. Please try again.',
  'auth/internal-error': 'An internal error occurred. Please try again later.',
};

// Helper function to handle auth errors
const handleAuthError = (error) => {
  console.error("Auth error:", error.code, error.message);
  return {
    code: error.code,
    message: AUTH_ERROR_MESSAGES[error.code] || 'Authentication failed. Please try again later.'
  };
};

// Sign in function
export const signIn = async (email, password) => {
  try {
    const auth = getAuth();
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Get user's profile data from Firestore
    const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
    const userData = userDoc.data();

    return {
      success: true,
      user: userCredential.user,
      profile: userData,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      user: null,
      profile: null,
      error: handleAuthError(error)
    };
  }
};

// Sign up function
export const signUp = async (email, password, username) => {
  try {
    const auth = getAuth();
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Update profile with username
    await updateProfile(userCredential.user, {
      displayName: username
    });

    // Create user document in Firestore
    const userData = {
      uid: userCredential.user.uid,
      email,
      username,
      role: ROLES.USER,
      createdAt: new Date().toISOString(),
      stats: {
        sessions: 0,
        challenges: 0,
        wins: 0
      }
    };

    await setDoc(doc(db, 'users', userCredential.user.uid), userData);

    return {
      success: true,
      user: userCredential.user,
      profile: userData,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      user: null,
      profile: null,
      error: handleAuthError(error)
    };
  }
};

// Password reset function
export const resetPassword = async (email) => {
  try {
    const auth = getAuth();
    await auth.sendPasswordResetEmail(email);
    return {
      success: true,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      error: handleAuthError(error)
    };
  }
};

// Sign out function
export const signOut = async () => {
  try {
    const auth = getAuth();
    await auth.signOut();
    return {
      success: true,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      error: handleAuthError(error)
    };
  }
};
