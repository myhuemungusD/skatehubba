/**
 * Firebase Admin SDK initialization
 *
 * Single point of initialization for Firebase Admin SDK.
 * All other modules should import from here to avoid duplicate initialization.
 */

import * as admin from "firebase-admin";

// Initialize Firebase Admin if not already done
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Get the Firestore database instance
 * Use this function instead of admin.firestore() directly
 */
export function getAdminDb(): admin.firestore.Firestore {
  return admin.firestore();
}

/**
 * Get the Firebase Admin Auth instance
 */
export function getAdminAuth(): admin.auth.Auth {
  return admin.auth();
}

/**
 * Export admin for cases where direct access is needed
 */
export { admin };
