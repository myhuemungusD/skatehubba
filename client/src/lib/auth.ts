import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  GoogleAuthProvider,
  signInWithPopup as firebaseSignInWithPopup,
  signInWithRedirect as firebaseSignInWithRedirect,
  getRedirectResult as firebaseGetRedirectResult,
  signInAnonymously as firebaseSignInAnonymously,
  updateProfile,
  type ConfirmationResult
} from "firebase/auth";
import { auth } from "./firebase";

/**
 * Check if we're running in mock Firebase mode
 * This is true when Firebase API keys are not configured
 */
function isMockMode(): boolean {
  return !!(auth as any)?._isMock;
}

/**
 * Wrapper for signOut that handles mock mode
 */
async function signOut(authInstance: typeof auth): Promise<void> {
  if (isMockMode()) {
    await (authInstance as any).signOut();
  } else {
    await firebaseSignOut(authInstance);
  }
}

/**
 * Wrapper for signInAnonymously that handles mock mode
 */
async function signInAnonymously(authInstance: typeof auth): Promise<{ user: any }> {
  if (isMockMode()) {
    return await (authInstance as any).signInAnonymously();
  }
  return await firebaseSignInAnonymously(authInstance);
}

/**
 * Wrapper for signInWithPopup that handles mock mode
 */
async function signInWithPopup(authInstance: typeof auth, provider: GoogleAuthProvider): Promise<{ user: any }> {
  if (isMockMode()) {
    return await (authInstance as any).signInWithPopup(provider);
  }
  return await firebaseSignInWithPopup(authInstance, provider);
}

/**
 * Wrapper for signInWithRedirect that handles mock mode
 */
async function signInWithRedirect(authInstance: typeof auth, provider: GoogleAuthProvider): Promise<void> {
  if (isMockMode()) {
    await (authInstance as any).signInWithRedirect(provider);
  } else {
    await firebaseSignInWithRedirect(authInstance, provider);
  }
}

/**
 * Wrapper for getRedirectResult that handles mock mode
 */
async function getRedirectResult(authInstance: typeof auth): Promise<{ user: any } | null> {
  if (isMockMode()) {
    return await (authInstance as any).getRedirectResult();
  }
  return await firebaseGetRedirectResult(authInstance);
}

type RegistrationProfile = {
  firstName?: string;
  lastName?: string;
};

type BackendProfile = RegistrationProfile & {
  isRegistration?: boolean;
};

function extractNameParts(displayName?: string) {
  if (!displayName) {
    return { firstName: undefined, lastName: undefined };
  }

  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 0) {
    return { firstName: undefined, lastName: undefined };
  }

  const [firstName, ...rest] = parts;
  const lastName = rest.length > 0 ? rest.join(" ") : undefined;
  return { firstName, lastName };
}

async function authenticateWithBackend(firebaseUser: User, profile: BackendProfile = {}) {
  const idToken = await firebaseUser.getIdToken();
  const derivedNames = extractNameParts(firebaseUser.displayName ?? undefined);

  const payload: Record<string, unknown> = {};

  const firstName = profile.firstName ?? derivedNames.firstName;
  if (firstName) {
    payload.firstName = firstName;
  }

  const lastName = profile.lastName ?? derivedNames.lastName;
  if (lastName) {
    payload.lastName = lastName;
  }

  if (typeof profile.isRegistration === "boolean") {
    payload.isRegistration = profile.isRegistration;
  }

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    credentials: "include"
  });

  if (!response.ok) {
    let errorMessage = "Login failed";
    try {
      const errorData = await response.json();
      if (typeof errorData?.error === "string" && errorData.error.trim().length > 0) {
        errorMessage = errorData.error;
      }
    } catch (parseError) {
      // ignore JSON parse errors - we'll use default message
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function registerUser(email: string, password: string, profile: RegistrationProfile = {}) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const firebaseUser = userCredential.user;

  const displayName = `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();
  if (displayName.length > 0) {
    await updateProfile(firebaseUser, { displayName });
  }

  await sendEmailVerification(firebaseUser);

  return firebaseUser;
}

export async function loginUser(email: string, password: string) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = userCredential.user;

  if (!firebaseUser.emailVerified) {
    await signOut(auth);
    throw new Error("Please verify your email before logging in.");
  }

  return authenticateWithBackend(firebaseUser);
}

/**
 * Professional Google Sign-In with automatic fallback and error handling
 * - Tries popup first (better UX on desktop)
 * - Falls back to redirect on popup blockers or mobile
 * - Distinguishes Firebase errors from backend errors
 * - Provides clear error messages for each scenario
 */
export async function loginWithGoogle(forceRedirect = false) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ 
    prompt: "select_account",
    // Request user's basic profile and email
    scope: "profile email"
  });

  // Mobile detection - prefer redirect on mobile devices
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (forceRedirect || isMobile) {
    // Use redirect flow (better for mobile)
    await signInWithRedirect(auth, provider);
    // Note: User will be redirected away, control returns via handleGoogleRedirect()
    return null;
  }

  // Desktop: Try popup first
  let firebaseUser: User;
  
  try {
    // Step 1: Firebase popup authentication
    const userCredential = await signInWithPopup(auth, provider);
    firebaseUser = userCredential.user;
  } catch (error: any) {
    // Handle Firebase popup errors (not backend errors)
    const errorCode = error?.code || '';
    const errorMessage = error?.message || '';

    // Popup blocked or closed by user - fallback to redirect
    if (errorCode === 'auth/popup-blocked' || 
        errorCode === 'auth/popup-closed-by-user' ||
        errorMessage.includes('popup')) {
      console.log('[Google Auth] Popup blocked, falling back to redirect...');
      await signInWithRedirect(auth, provider);
      return null;
    }

    // User cancelled
    if (errorCode === 'auth/cancelled-popup-request' || 
        errorCode === 'auth/user-cancelled') {
      throw new Error('Google Sign-In was cancelled');
    }

    // Network errors
    if (errorCode === 'auth/network-request-failed' ||
        errorMessage.includes('network')) {
      throw new Error('Network error. Please check your connection and try again.');
    }

    // Account exists with different credential
    if (errorCode === 'auth/account-exists-with-different-credential') {
      throw new Error('An account already exists with this email using a different sign-in method');
    }

    // Too many requests
    if (errorCode === 'auth/too-many-requests') {
      throw new Error('Too many sign-in attempts. Please try again in a few minutes.');
    }

    // Generic Firebase error - try redirect as last resort
    console.warn('[Google Auth] Firebase popup failed, attempting redirect fallback:', errorCode);
    try {
      await signInWithRedirect(auth, provider);
      return null;
    } catch (redirectError: any) {
      throw new Error(`Google Sign-In failed: ${redirectError?.message || 'Unknown error'}`);
    }
  }

  // Step 2: Backend authentication (separate from Firebase errors)
  try {
    return await authenticateWithBackend(firebaseUser);
  } catch (backendError: any) {
    // Backend authentication failed - do NOT fallback to redirect
    // User successfully signed in with Google, but backend rejected them
    // Sign out from Firebase to avoid broken state
    await signOut(auth);
    
    // Re-throw backend error so UI can show it directly
    throw new Error(backendError?.message || 'Server authentication failed. Please try again.');
  }
}

/**
 * Handle Google redirect result after user returns from Google login page
 * Call this on app initialization to complete redirect-based sign-in
 */
export async function handleGoogleRedirect() {
  try {
    if (!auth || typeof auth.onAuthStateChanged !== 'function') {
      return null;
    }
    
    // Skip redirect handling in mock mode - mock signInWithRedirect completes synchronously
    // and doesn't require redirect result processing
    if (isMockMode()) {
      return null;
    }

    const result = await getRedirectResult(auth);
    
    if (result) {
      // User just returned from Google redirect
      const firebaseUser = result.user;
      return authenticateWithBackend(firebaseUser);
    }
    
    return null; // No redirect result (normal page load)
  } catch (error: any) {
    const errorCode = error?.code || '';
    
    // Handle specific redirect errors
    if (errorCode === 'auth/account-exists-with-different-credential') {
      throw new Error('An account already exists with this email using a different sign-in method');
    }
    
    if (errorCode === 'auth/credential-already-in-use') {
      throw new Error('This credential is already associated with a different account');
    }

    throw error;
  }
}

export async function loginAnonymously() {
  const userCredential = await signInAnonymously(auth);
  const firebaseUser = userCredential.user;

  return authenticateWithBackend(firebaseUser);
}

export async function logoutUser() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include"
    });
  } catch (error) {
    console.error("Backend logout failed:", error);
  }

  await signOut(auth);
}

export const listenToAuth = (callback: (user: User | null) => void) => {
  try {
    if (!auth || typeof auth.onAuthStateChanged !== 'function') {
      console.warn("[Auth] Firebase Auth not fully initialized, skipping listener");
      if (typeof callback === 'function') callback(null);
      return () => {};
    }
    return auth.onAuthStateChanged(callback);
  } catch (error) {
    console.error("[Auth] listenToAuth error:", error);
    if (typeof callback === 'function') callback(null);
    return () => {};
  }
};

// Phone Authentication
let activeRecaptcha: RecaptchaVerifier | null = null;

export async function setupRecaptcha(elementId: string): Promise<RecaptchaVerifier> {
  if (typeof window === "undefined") {
    throw new Error("reCAPTCHA can only be initialized in the browser.");
  }

  if (activeRecaptcha) {
    await activeRecaptcha.clear();
    activeRecaptcha = null;
  }

  activeRecaptcha = new RecaptchaVerifier(auth, elementId, {
    size: "invisible",
    callback: () => {
      // reCAPTCHA solved - Firebase will continue with phone auth
    }
  });

  await activeRecaptcha.render();
  return activeRecaptcha;
}

export async function sendPhoneVerification(phoneNumber: string, recaptchaVerifier: RecaptchaVerifier) {
  const normalizedPhone = phoneNumber.replace(/[\s-]/g, "").trim();

  if (!normalizedPhone.startsWith("+")) {
    throw new Error("Enter the phone number in international format, e.g. +1 555 555 5555.");
  }

  return signInWithPhoneNumber(auth, normalizedPhone, recaptchaVerifier);
}

export async function verifyPhoneCode(confirmationResult: ConfirmationResult, code: string) {
  const sanitizedCode = code.trim();
  if (!sanitizedCode) {
    throw new Error("Enter the verification code sent to your phone.");
  }

  const userCredential = await confirmationResult.confirm(sanitizedCode);
  const firebaseUser = userCredential.user;

  return authenticateWithBackend(firebaseUser);
}
