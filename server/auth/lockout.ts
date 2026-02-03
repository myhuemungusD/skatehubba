/**
 * Account Lockout Service
 *
 * Implements account lockout after consecutive failed login attempts.
 * Prevents brute-force attacks by temporarily locking accounts.
 *
 * Features:
 * - Tracks failed login attempts per email
 * - Auto-locks account after MAX_LOGIN_ATTEMPTS failures
 * - Auto-unlocks after LOCKOUT_DURATION
 * - Progressive lockout (longer durations for repeat offenders)
 *
 * @module auth/lockout
 */

import { getDb } from "../db.ts";
import { loginAttempts, accountLockouts } from "../../packages/shared/schema.ts";
import { eq, and, gt, sql, count } from "drizzle-orm";
import { SECURITY_CONFIG } from "../security.ts";
import { AuditLogger } from "./audit.ts";
import logger from "../logger.ts";

export interface LockoutStatus {
  isLocked: boolean;
  unlockAt?: Date;
  remainingAttempts?: number;
  failedAttempts: number;
}

/**
 * Account Lockout Service
 *
 * Manages login attempt tracking and account lockout functionality.
 */
export class LockoutService {
  private static readonly MAX_ATTEMPTS = SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS;
  private static readonly LOCKOUT_DURATION = SECURITY_CONFIG.LOCKOUT_DURATION;
  private static readonly ATTEMPT_WINDOW = 60 * 60 * 1000; // 1 hour window for counting attempts

  /**
   * Check if an account is currently locked
   *
   * @param email - Email address to check
   * @returns Lockout status including whether locked and when it unlocks
   */
  static async checkLockout(email: string): Promise<LockoutStatus> {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Check if there's an active lockout
      const [lockout] = await getDb()
        .select()
        .from(accountLockouts)
        .where(
          and(eq(accountLockouts.email, normalizedEmail), gt(accountLockouts.unlockAt, new Date()))
        );

      if (lockout) {
        return {
          isLocked: true,
          unlockAt: lockout.unlockAt,
          failedAttempts: lockout.failedAttempts,
        };
      }

      // Count recent failed attempts
      const windowStart = new Date(Date.now() - this.ATTEMPT_WINDOW);
      const [result] = await getDb()
        .select({ count: count() })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.email, normalizedEmail),
            eq(loginAttempts.success, false),
            gt(loginAttempts.createdAt, windowStart)
          )
        );

      const failedAttempts = result?.count || 0;

      return {
        isLocked: false,
        failedAttempts,
        remainingAttempts: Math.max(0, this.MAX_ATTEMPTS - failedAttempts),
      };
    } catch (error) {
      logger.error("Error checking lockout status", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Fail open - don't lock legitimate users if DB fails
      return {
        isLocked: false,
        failedAttempts: 0,
        remainingAttempts: this.MAX_ATTEMPTS,
      };
    }
  }

  /**
   * Record a login attempt
   *
   * @param email - Email address attempted
   * @param ipAddress - IP address of the request
   * @param success - Whether the login succeeded
   * @returns Updated lockout status
   */
  static async recordAttempt(
    email: string,
    ipAddress: string,
    success: boolean
  ): Promise<LockoutStatus> {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Record the attempt
      await getDb().insert(loginAttempts).values({
        email: normalizedEmail,
        ipAddress,
        success,
      });

      // If successful, clear any existing lockout for this email
      if (success) {
        await getDb().delete(accountLockouts).where(eq(accountLockouts.email, normalizedEmail));

        return {
          isLocked: false,
          failedAttempts: 0,
          remainingAttempts: this.MAX_ATTEMPTS,
        };
      }

      // Check if we need to lock the account
      const status = await this.checkLockout(normalizedEmail);

      if (!status.isLocked && status.failedAttempts >= this.MAX_ATTEMPTS) {
        // Lock the account
        const unlockAt = new Date(Date.now() + this.LOCKOUT_DURATION);

        // Upsert the lockout record
        await getDb()
          .insert(accountLockouts)
          .values({
            email: normalizedEmail,
            lockedAt: new Date(),
            unlockAt,
            failedAttempts: status.failedAttempts,
          })
          .onConflictDoUpdate({
            target: accountLockouts.email,
            set: {
              lockedAt: new Date(),
              unlockAt,
              failedAttempts: status.failedAttempts,
            },
          });

        // Log the lockout event
        await AuditLogger.logAccountLocked(
          "", // No user ID for failed logins
          normalizedEmail,
          ipAddress,
          status.failedAttempts
        );

        logger.warn("Account locked due to failed login attempts", {
          email: normalizedEmail,
          failedAttempts: status.failedAttempts,
          unlockAt: unlockAt.toISOString(),
        });

        return {
          isLocked: true,
          unlockAt,
          failedAttempts: status.failedAttempts,
        };
      }

      return status;
    } catch (error) {
      logger.error("Error recording login attempt", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Return current status even if recording fails
      return this.checkLockout(normalizedEmail);
    }
  }

  /**
   * Manually unlock an account (admin action)
   *
   * @param email - Email address to unlock
   */
  static async unlockAccount(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    await getDb().delete(accountLockouts).where(eq(accountLockouts.email, normalizedEmail));

    logger.info("Account unlocked manually", {
      email: normalizedEmail,
      reason: "manual_unlock",
    });
  }

  /**
   * Clean up expired lockouts and old attempt records
   * Should be run periodically (e.g., via cron job)
   */
  static async cleanup(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.ATTEMPT_WINDOW * 2);

    try {
      // Remove expired lockouts
      await getDb()
        .delete(accountLockouts)
        .where(sql`${accountLockouts.unlockAt} < NOW()`);

      // Remove old attempt records
      await getDb()
        .delete(loginAttempts)
        .where(sql`${loginAttempts.createdAt} < ${cutoffDate}`);

      logger.info("Cleaned up expired lockouts and old login attempts");
    } catch (error) {
      logger.error("Error cleaning up lockout data", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get the lockout duration message for display
   */
  static getLockoutMessage(unlockAt: Date): string {
    const now = Date.now();
    const unlockTime = unlockAt.getTime();
    const remainingMs = unlockTime - now;

    if (remainingMs <= 0) {
      return "Your account is now unlocked. Please try again.";
    }

    const remainingMinutes = Math.ceil(remainingMs / 60000);

    if (remainingMinutes <= 1) {
      return "Account temporarily locked. Please try again in less than a minute.";
    } else if (remainingMinutes < 60) {
      return `Account temporarily locked. Please try again in ${remainingMinutes} minutes.`;
    } else {
      const remainingHours = Math.ceil(remainingMinutes / 60);
      return `Account temporarily locked. Please try again in ${remainingHours} hour${remainingHours > 1 ? "s" : ""}.`;
    }
  }
}

export default LockoutService;
