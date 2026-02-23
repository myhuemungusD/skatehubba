/**
 * MFA — AES-256-GCM Encryption
 *
 * Encrypts and decrypts TOTP secrets at rest.
 * Supports v2 format (per-ciphertext random salt) and legacy format
 * (hardcoded "mfa-salt" — kept for migrating existing rows).
 *
 * Security note: getMfaBaseKey() is intentionally NOT re-exported from
 * index.ts — it must remain internal to the mfa/ module.
 */

import crypto from "crypto";
import { env } from "../../config/env.ts";
import logger from "../../logger.ts";

// Encryption configuration
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

// Version prefix to distinguish new (random-salt) from legacy (hardcoded-salt) ciphertexts
const CIPHER_V2_PREFIX = "v2$";

/**
 * Resolve the MFA encryption base key.
 * Prefers a dedicated MFA_ENCRYPTION_KEY to isolate MFA secrets from JWT signing material.
 * In production, MFA_ENCRYPTION_KEY is required (enforced by env schema at boot).
 * In development, falls back to JWT_SECRET with a warning.
 * Result is cached so the fallback warning is emitted at most once.
 */
let _mfaBaseKey: string | null = null;
function getMfaBaseKey(): string {
  if (_mfaBaseKey !== null) return _mfaBaseKey;

  const dedicated = process.env.MFA_ENCRYPTION_KEY;
  if (dedicated && dedicated.length >= 32) {
    _mfaBaseKey = dedicated;
    return _mfaBaseKey;
  }

  // In production, MFA_ENCRYPTION_KEY should have been enforced at boot by env.ts.
  // This is a defense-in-depth check — if we somehow reach here, fail hard.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "MFA_ENCRYPTION_KEY is required in production but was not set. " +
        "This should have been caught at startup by env validation."
    );
  }

  // In development, fall back to JWT_SECRET (which is now also guaranteed to be set and >=32 chars)
  logger.warn(
    "MFA_ENCRYPTION_KEY not set in development — using JWT_SECRET for MFA encryption. " +
      "Set a dedicated MFA_ENCRYPTION_KEY for better security isolation."
  );
  _mfaBaseKey = env.JWT_SECRET;
  return _mfaBaseKey;
}

/**
 * Encrypt a string using AES-256-GCM with a per-ciphertext random salt.
 * Output format: "v2$" + salt(hex) + iv(hex) + authTag(hex) + ciphertext(hex)
 */
export function encrypt(text: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.scryptSync(getMfaBaseKey(), salt, 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return (
    CIPHER_V2_PREFIX +
    salt.toString("hex") +
    iv.toString("hex") +
    authTag.toString("hex") +
    encrypted
  );
}

/**
 * Decrypt a string encrypted with AES-256-GCM.
 * Supports both v2 (random salt) and legacy (hardcoded "mfa-salt") ciphertexts.
 */
export function decrypt(encryptedText: string): string {
  if (encryptedText.startsWith(CIPHER_V2_PREFIX)) {
    // v2 format: "v2$" + salt(32 hex) + iv(32 hex) + authTag(32 hex) + ciphertext
    const payload = encryptedText.slice(CIPHER_V2_PREFIX.length);
    const salt = Buffer.from(payload.slice(0, SALT_LENGTH * 2), "hex");
    const iv = Buffer.from(payload.slice(SALT_LENGTH * 2, (SALT_LENGTH + IV_LENGTH) * 2), "hex");
    const authTag = Buffer.from(
      payload.slice(
        (SALT_LENGTH + IV_LENGTH) * 2,
        (SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) * 2
      ),
      "hex"
    );
    const encrypted = payload.slice((SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) * 2);

    const key = crypto.scryptSync(getMfaBaseKey(), salt, 32);
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  // Legacy format: iv(32 hex) + authTag(32 hex) + ciphertext  (hardcoded salt, JWT_SECRET key)
  const key = crypto.scryptSync(env.JWT_SECRET, "mfa-salt", 32);

  const iv = Buffer.from(encryptedText.slice(0, IV_LENGTH * 2), "hex");
  const authTag = Buffer.from(
    encryptedText.slice(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2),
    "hex"
  );
  const encrypted = encryptedText.slice((IV_LENGTH + AUTH_TAG_LENGTH) * 2);

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
