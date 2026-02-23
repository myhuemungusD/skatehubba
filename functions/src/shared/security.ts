/**
 * Shared Security Utilities
 *
 * Common security functions used across Cloud Functions.
 */

import * as functions from "firebase-functions";

/**
 * Verify App Check token if available (soft enforcement)
 */
export function verifyAppCheck(context: functions.https.CallableContext): void {
  if (!context.app) {
    functions.logger.warn("[Security] Request without App Check token from:", context.auth?.uid);
  }
}

/**
 * Mask email for privacy (show first char + domain)
 * john.doe@gmail.com -> j***@gmail.com
 */
export function maskEmail(email: string | undefined): string {
  if (!email) return "***";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0]}***@${domain}`;
}
