/**
 * Multi-Factor Authentication (MFA) Service
 *
 * Implements TOTP-based two-factor authentication using industry-standard
 * algorithms compatible with Google Authenticator, Authy, 1Password, etc.
 *
 * Features:
 * - TOTP (Time-based One-Time Password) generation and verification
 * - Encrypted secret storage
 * - Backup codes for account recovery
 * - QR code generation for easy setup
 *
 * Security:
 * - Secrets encrypted at rest with AES-256-GCM
 * - Backup codes hashed with bcrypt
 * - 30-second TOTP window with 1-step tolerance
 *
 * @module auth/mfa
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "../db.ts";
import { mfaSecrets } from "../../packages/shared/schema.ts";
import { eq } from "drizzle-orm";
import { env } from "../config/env.ts";
import { AuditLogger } from "./audit.ts";
import logger from "../logger.ts";

// TOTP Configuration (RFC 6238 compliant)
const TOTP_CONFIG = {
  algorithm: "sha1",
  digits: 6,
  period: 30, // 30 second window
  window: 1, // Allow 1 step before/after for clock drift
  issuer: "SkateHubba",
} as const;

// Encryption configuration
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a string using AES-256-GCM
 */
function encrypt(text: string): string {
  const key = crypto.scryptSync(env.JWT_SECRET, "mfa-salt", 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return IV + AuthTag + Encrypted data
  return iv.toString("hex") + authTag.toString("hex") + encrypted;
}

/**
 * Decrypt a string encrypted with AES-256-GCM
 */
function decrypt(encryptedText: string): string {
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

/**
 * Generate a Base32-encoded secret for TOTP
 */
function generateSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Base32 encoding (RFC 4648)
 */
function base32Encode(buffer: Buffer): string {
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
function base32Decode(str: string): Buffer {
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

/**
 * Generate TOTP code for a given secret and time
 */
function generateTOTP(secret: string, timestamp?: number): string {
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
function verifyTOTP(secret: string, code: string): boolean {
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

/**
 * Generate backup codes for account recovery
 */
function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate readable 8-character codes (uppercase + numbers, excluding confusing chars)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    codes.push(code);
  }
  return codes;
}

/**
 * MFA Service
 *
 * Manages TOTP-based multi-factor authentication for user accounts.
 */
export class MfaService {
  /**
   * Initialize MFA setup for a user
   * Returns the secret and QR code URL for scanning
   */
  static async initiateSetup(
    userId: string,
    email: string
  ): Promise<{
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
  }> {
    // Generate new secret
    const secret = generateSecret();
    const backupCodes = generateBackupCodes();

    // Hash backup codes for storage
    const hashedBackupCodes = await Promise.all(backupCodes.map((code) => bcrypt.hash(code, 10)));

    // Store encrypted secret (not enabled yet until verified)
    const encryptedSecret = encrypt(secret);

    await getDb()
      .insert(mfaSecrets)
      .values({
        userId,
        secret: encryptedSecret,
        backupCodes: hashedBackupCodes,
        enabled: false,
      })
      .onConflictDoUpdate({
        target: mfaSecrets.userId,
        set: {
          secret: encryptedSecret,
          backupCodes: hashedBackupCodes,
          enabled: false,
          verifiedAt: null,
          updatedAt: new Date(),
        },
      });

    // Generate otpauth URL for QR code
    const encodedEmail = encodeURIComponent(email);
    const encodedIssuer = encodeURIComponent(TOTP_CONFIG.issuer);
    const qrCodeUrl = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=${TOTP_CONFIG.algorithm.toUpperCase()}&digits=${TOTP_CONFIG.digits}&period=${TOTP_CONFIG.period}`;

    logger.info("MFA setup initiated", { userId });

    return {
      secret, // Return plaintext for QR display
      qrCodeUrl,
      backupCodes, // Return plaintext for user to save
    };
  }

  /**
   * Complete MFA setup by verifying the first code
   */
  static async verifySetup(
    userId: string,
    email: string,
    code: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<boolean> {
    const mfaRecord = await this.getMfaRecord(userId);

    if (!mfaRecord) {
      return false;
    }

    const secret = decrypt(mfaRecord.secret);
    const isValid = verifyTOTP(secret, code);

    if (isValid) {
      // Enable MFA
      await getDb()
        .update(mfaSecrets)
        .set({
          enabled: true,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mfaSecrets.userId, userId));

      await AuditLogger.logMfaEvent(userId, email, ipAddress, "enabled", userAgent);

      logger.info("MFA enabled", { userId });

      return true;
    }

    return false;
  }

  /**
   * Verify a TOTP code for login
   */
  static async verifyCode(
    userId: string,
    email: string,
    code: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<boolean> {
    const mfaRecord = await this.getMfaRecord(userId);

    if (!mfaRecord || !mfaRecord.enabled) {
      return false;
    }

    const secret = decrypt(mfaRecord.secret);
    const isValid = verifyTOTP(secret, code);

    await AuditLogger.logMfaEvent(
      userId,
      email,
      ipAddress,
      isValid ? "success" : "failure",
      userAgent
    );

    return isValid;
  }

  /**
   * Verify a backup code (one-time use)
   */
  static async verifyBackupCode(
    userId: string,
    email: string,
    code: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<boolean> {
    const mfaRecord = await this.getMfaRecord(userId);

    if (!mfaRecord || !mfaRecord.enabled || !mfaRecord.backupCodes) {
      return false;
    }

    const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

    // Check each backup code
    for (let i = 0; i < mfaRecord.backupCodes.length; i++) {
      const hashedCode = mfaRecord.backupCodes[i];
      const isMatch = await bcrypt.compare(normalizedCode, hashedCode);

      if (isMatch) {
        // Remove the used backup code
        const updatedCodes = [...mfaRecord.backupCodes];
        updatedCodes.splice(i, 1);

        await getDb()
          .update(mfaSecrets)
          .set({
            backupCodes: updatedCodes,
            updatedAt: new Date(),
          })
          .where(eq(mfaSecrets.userId, userId));

        await AuditLogger.logMfaEvent(userId, email, ipAddress, "success", userAgent);

        logger.info("MFA backup code used", {
          userId,
          remainingCodes: updatedCodes.length,
        });

        return true;
      }
    }

    await AuditLogger.logMfaEvent(userId, email, ipAddress, "failure", userAgent);
    return false;
  }

  /**
   * Disable MFA for a user
   */
  static async disable(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<void> {
    await getDb().delete(mfaSecrets).where(eq(mfaSecrets.userId, userId));

    await AuditLogger.logMfaEvent(userId, email, ipAddress, "disabled", userAgent);

    logger.info("MFA disabled", { userId });
  }

  /**
   * Check if a user has MFA enabled
   */
  static async isEnabled(userId: string): Promise<boolean> {
    const mfaRecord = await this.getMfaRecord(userId);
    return mfaRecord?.enabled || false;
  }

  /**
   * Get MFA record for a user
   */
  private static async getMfaRecord(userId: string) {
    const [record] = await getDb().select().from(mfaSecrets).where(eq(mfaSecrets.userId, userId));

    return record;
  }

  /**
   * Regenerate backup codes for a user
   */
  static async regenerateBackupCodes(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<string[] | null> {
    const mfaRecord = await this.getMfaRecord(userId);

    if (!mfaRecord || !mfaRecord.enabled) {
      return null;
    }

    const newBackupCodes = generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      newBackupCodes.map((code) => bcrypt.hash(code, 10))
    );

    await getDb()
      .update(mfaSecrets)
      .set({
        backupCodes: hashedBackupCodes,
        updatedAt: new Date(),
      })
      .where(eq(mfaSecrets.userId, userId));

    await AuditLogger.log({
      eventType: "MFA_BACKUP_CODES_REGENERATED" as any,
      userId,
      email,
      ipAddress,
      userAgent,
      success: true,
    });

    return newBackupCodes;
  }
}

export default MfaService;
