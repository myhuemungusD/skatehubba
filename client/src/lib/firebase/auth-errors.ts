/**
 * Firebase Auth Error Code → User-Friendly Message Mapper
 *
 * Maps Firebase Authentication error codes to clear, actionable messages
 * that users can understand and act on. Prevents raw Firebase error strings
 * (e.g., "Firebase: Error (auth/email-already-in-use).") from reaching the UI.
 *
 * @module lib/firebase/auth-errors
 */

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // Sign-up errors
  "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
  "auth/weak-password":
    "Password is too weak. Use at least 8 characters with uppercase, lowercase, and a number.",
  "auth/invalid-email": "That email address doesn't look right. Please check and try again.",
  "auth/operation-not-allowed": "Email/password sign-up is not enabled. Please contact support.",

  // Sign-in errors
  "auth/user-not-found": "No account found with this email. Check your spelling or sign up.",
  "auth/wrong-password": "Incorrect password. Try again or reset your password.",
  "auth/invalid-credential": "Incorrect email or password. Try again or reset your password.",
  "auth/user-disabled": "This account has been disabled. Contact support for help.",
  "auth/too-many-requests":
    "Too many failed attempts. Please wait a few minutes before trying again.",

  // Password reset errors
  "auth/missing-email": "Please enter your email address.",
  "auth/user-not-found-reset": "If an account exists with this email, a reset link has been sent.",

  // Google / OAuth errors
  "auth/account-exists-with-different-credential":
    "An account already exists with this email using a different sign-in method.",
  "auth/popup-closed-by-user": "Sign-in was cancelled. Please try again.",
  "auth/popup-blocked": "Pop-up was blocked by your browser. Allow pop-ups and try again.",
  "auth/cancelled-popup-request": "Sign-in was cancelled. Please try again.",
  "auth/unauthorized-domain": "This domain is not authorized for sign-in. Please contact support.",
  "auth/operation-not-supported-in-this-environment":
    "This sign-in method is not supported in your current browser. Try opening in Safari or Chrome.",

  // Verification errors
  "auth/expired-action-code": "This link has expired. Please request a new one.",
  "auth/invalid-action-code": "This link is invalid or has already been used.",

  // Configuration errors
  "auth/api-key-not-valid":
    "Firebase is not configured correctly. The app was likely deployed without the required " +
    "EXPO_PUBLIC_FIREBASE_* environment variables. Please contact support.",
  "auth/invalid-api-key":
    "Firebase is not configured correctly. The app was likely deployed without the required " +
    "EXPO_PUBLIC_FIREBASE_* environment variables. Please contact support.",

  // Network / generic errors
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/internal-error": "Something went wrong on our end. Please try again.",
  "auth/requires-recent-login": "For security, please sign in again to complete this action.",
};

/**
 * Extract the Firebase error code from an error object.
 * Firebase errors can come as { code: "auth/..." } or as raw strings.
 */
function extractFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const err = error as Record<string, unknown>;

  // Firebase errors have a `code` property
  if (typeof err.code === "string" && err.code.startsWith("auth/")) {
    return err.code;
  }

  // Sometimes the error message contains the code
  if (typeof err.message === "string") {
    const match = err.message.match(/\(auth\/[a-z-]+\)/);
    if (match) {
      return match[0].slice(1, -1); // Remove parentheses
    }
  }

  return null;
}

/**
 * Convert a Firebase Auth error into a user-friendly message.
 * Falls back to a generic message if the error code is unrecognized.
 *
 * Firebase sometimes appends extra text to error codes (e.g. the actual code
 * is "auth/api-key-not-valid.-please-pass-a-valid-api-key." not just the short
 * "auth/api-key-not-valid"), so we also try a prefix match on the base slug.
 */
export function getAuthErrorMessage(error: unknown): string {
  const code = extractFirebaseErrorCode(error);

  if (code) {
    // Exact match first
    if (AUTH_ERROR_MESSAGES[code]) {
      return AUTH_ERROR_MESSAGES[code];
    }
    // Prefix match: strip everything after the first '.' following 'auth/'
    // e.g. "auth/api-key-not-valid.-please-pass-a-valid-api-key." → "auth/api-key-not-valid"
    const shortCode = code.replace(/^(auth\/[a-z-]+)\..*$/, "$1");
    if (shortCode !== code && AUTH_ERROR_MESSAGES[shortCode]) {
      return AUTH_ERROR_MESSAGES[shortCode];
    }
  }

  // Fallback: if the error has a readable message that isn't a raw Firebase string
  if (error instanceof Error) {
    const msg = error.message;
    // Filter out raw Firebase error format: "Firebase: Error (auth/...)."
    if (!msg.startsWith("Firebase:") && msg.length < 200) {
      return msg;
    }
  }

  return "Something went wrong. Please try again.";
}
