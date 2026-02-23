/**
 * MFA — TOTP (RFC 6238) & Base32 (RFC 4648)
 *
 * Provides TOTP code generation, verification with clock-drift tolerance,
 * and Base32 encoding/decoding for secret interchange with authenticator apps.
 */

import crypto from "crypto";

// TOTP Configuration (RFC 6238 compliant)
export const TOTP_CONFIG = {
  algorithm: "sha1",
  digits: 6,
  period: 30, // 30 second window
  window: 1, // Allow 1 step before/after for clock drift
  issuer: "SkateHubba",
} as const;

// ============================================================================
// Base32 (RFC 4648)
// ============================================================================

/**
 * Base32 encoding (RFC 4648)
 */
export function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/**
 * Base32 decoding (RFC 4648)
 */
export function base32Decode(str: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanStr = str.toUpperCase().replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let value = 0;
  const result: number[] = [];

  for (const char of cleanStr) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;

    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(result);
}

// ============================================================================
// Secret Generation
// ============================================================================

/**
 * Generate a Base32-encoded secret for TOTP
 */
export function generateSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

// ============================================================================
// TOTP Generation & Verification
// ============================================================================

/**
 * Generate TOTP code for a given secret and time
 */
export function generateTOTP(secret: string, timestamp?: number): string {
  const time = timestamp || Date.now();
  const counter = Math.floor(time / 1000 / TOTP_CONFIG.period);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const secretBuffer = base32Decode(secret);
  const hmac = crypto.createHmac(TOTP_CONFIG.algorithm, secretBuffer);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_CONFIG.digits);
  return otp.toString().padStart(TOTP_CONFIG.digits, "0");
}

/**
 * Verify a TOTP code with window tolerance
 */
export function verifyTOTP(secret: string, code: string): boolean {
  const now = Date.now();
  const window = TOTP_CONFIG.window;
  const period = TOTP_CONFIG.period * 1000;

  // Check current period and allowed window
  for (let i = -window; i <= window; i++) {
    const checkTime = now + i * period;
    const expectedCode = generateTOTP(secret, checkTime);

    // Use timing-safe comparison
    if (
      crypto.timingSafeEqual(
        Buffer.from(code.padStart(TOTP_CONFIG.digits, "0")),
        Buffer.from(expectedCode)
      )
    ) {
      return true;
    }
  }

  return false;
}
