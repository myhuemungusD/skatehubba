/**
 * MFA — Backup Code Generation
 *
 * Generates human-readable one-time recovery codes for account recovery
 * when a TOTP device is unavailable.
 */

import crypto from "crypto";

/**
 * Generate backup codes for account recovery.
 * Each code is 8 uppercase alphanumeric characters (ambiguous chars excluded).
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  // Exclude visually ambiguous characters (0/O, 1/I/L)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    codes.push(code);
  }
  return codes;
}
