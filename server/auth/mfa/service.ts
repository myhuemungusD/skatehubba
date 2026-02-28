/**
 * MFA Service
 *
 * Manages TOTP-based multi-factor authentication for user accounts.
 * Coordinates database operations, encryption, and audit logging.
 */

import bcrypt from "bcryptjs";
import { getDb } from "../../db.ts";
import { mfaSecrets } from "../../../packages/shared/schema/index";
import { eq } from "drizzle-orm";
import { AuditLogger, AUDIT_EVENTS } from "../audit.ts";
import logger from "../../logger.ts";
import { encrypt, decrypt } from "./crypto";
import { generateSecret, verifyTOTP, TOTP_CONFIG } from "./totp";
import { generateBackupCodes } from "./backupCodes";

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
      eventType: AUDIT_EVENTS.MFA_BACKUP_CODES_REGENERATED,
      userId,
      email,
      ipAddress,
      userAgent,
      success: true,
    });

    return newBackupCodes;
  }
}
