/**
 * App Check Verification
 *
 * Soft enforcement helper — logs a warning when a request arrives without an
 * App Check token so that unenforced calls are visible in production logs.
 */

import * as functions from "firebase-functions";

/**
 * Verify App Check token if available (soft enforcement).
 * Logs a warning for requests without a valid App Check token.
 */
export function verifyAppCheck(context: functions.https.CallableContext): void {
  if (!context.app) {
    functions.logger.warn("[Security] Request without App Check token from:", context.auth?.uid);
  }
}
