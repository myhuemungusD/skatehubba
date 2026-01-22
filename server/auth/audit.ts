/**
 * Security Audit Logging Service
 *
 * Logs all authentication and security events for compliance and threat detection.
 * Enterprise-grade audit trail for:
 * - Login attempts (success/failure)
 * - Logout events
 * - Password changes/resets
 * - Account lockouts
 * - MFA events
 * - Session invalidations
 * - Suspicious activity
 *
 * @module auth/audit
 */

import { getDb, isDatabaseAvailable } from "../db.ts";
import { sql } from "drizzle-orm";
import logger from "../logger.ts";

// Audit event types
export const AUDIT_EVENTS = {
  // Authentication
  LOGIN_SUCCESS: "AUTH_LOGIN_SUCCESS",
  LOGIN_FAILURE: "AUTH_LOGIN_FAILURE",
  LOGOUT: "AUTH_LOGOUT",
  SESSION_CREATED: "AUTH_SESSION_CREATED",
  SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
  SESSION_INVALIDATED: "AUTH_SESSION_INVALIDATED",

  // Account management
  ACCOUNT_CREATED: "ACCOUNT_CREATED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_UNLOCKED: "ACCOUNT_UNLOCKED",
  ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",

  // Password
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",

  // MFA
  MFA_ENABLED: "MFA_ENABLED",
  MFA_DISABLED: "MFA_DISABLED",
  MFA_CHALLENGE_SUCCESS: "MFA_CHALLENGE_SUCCESS",
  MFA_CHALLENGE_FAILURE: "MFA_CHALLENGE_FAILURE",

  // Email
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  EMAIL_VERIFICATION_SENT: "EMAIL_VERIFICATION_SENT",

  // Security
  SUSPICIOUS_ACTIVITY: "SECURITY_SUSPICIOUS_ACTIVITY",
  RATE_LIMIT_EXCEEDED: "SECURITY_RATE_LIMIT",
  CSRF_VIOLATION: "SECURITY_CSRF_VIOLATION",
  INVALID_TOKEN: "SECURITY_INVALID_TOKEN",

  // Filmer credit workflow
  FILMER_REQUEST_CREATED: "FILMER_REQUEST_CREATED",
  FILMER_REQUEST_ACCEPTED: "FILMER_REQUEST_ACCEPTED",
  FILMER_REQUEST_REJECTED: "FILMER_REQUEST_REJECTED",
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];

export interface AuditLogEntry {
  eventType: AuditEventType;
  userId?: string | null;
  email?: string | null;
  ipAddress: string;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  success: boolean;
  errorMessage?: string | null;
}

/**
 * Extract client IP address from request
 * Handles proxies and load balancers
 */
export function getClientIP(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  ip?: string;
}): string {
  // Check for forwarded headers (behind proxy/load balancer)
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    // Take the first IP (original client)
    return ips.split(",")[0].trim();
  }

  // Check for real IP header (Nginx)
  const realIP = req.headers["x-real-ip"];
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }

  // Fallback to socket address or Express IP
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Security Audit Logger
 *
 * Provides structured logging for all security-relevant events.
 * Logs are stored in database for compliance and also written to application logs.
 */
export class AuditLogger {
  /**
   * Log an audit event
   *
   * @param entry - Audit log entry details
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    const timestamp = new Date();

    // Always log to application logger (immediate visibility)
    const logMessage = `AUDIT: ${entry.eventType}`;
    const logContext = {
      event: entry.eventType,
      userId: entry.userId,
      email: entry.email,
      ip: entry.ipAddress,
      success: entry.success,
      error: entry.errorMessage,
      metadata: entry.metadata,
      timestamp: timestamp.toISOString(),
    };

    if (entry.success) {
      logger.info(logMessage, logContext);
    } else {
      logger.warn(logMessage, logContext);
    }

    // Store in database for compliance/analysis
    try {
      if (!isDatabaseAvailable()) {
        logger.debug("Database not available for audit logging");
        return;
      }
      await getDb().execute(sql`
        INSERT INTO audit_logs (
          event_type, 
          user_id, 
          email, 
          ip_address, 
          user_agent, 
          metadata, 
          success, 
          error_message, 
          created_at
        ) VALUES (
          ${entry.eventType},
          ${entry.userId || null},
          ${entry.email || null},
          ${entry.ipAddress},
          ${entry.userAgent || null},
          ${JSON.stringify(entry.metadata || {})},
          ${entry.success},
          ${entry.errorMessage || null},
          ${timestamp}
        )
      `);
    } catch (dbError) {
      // Don't fail the request if audit logging fails
      // But do log the error for monitoring
      logger.error("Failed to write audit log to database", {
        error: dbError instanceof Error ? dbError.message : "Unknown error",
        originalEntry: entry,
      });
    }
  }

  /**
   * Log successful login
   */
  static async logLoginSuccess(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent?: string,
    provider: string = "firebase"
  ): Promise<void> {
    await this.log({
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      userId,
      email,
      ipAddress,
      userAgent,
      success: true,
      metadata: { provider },
    });
  }

  /**
   * Log failed login attempt
   */
  static async logLoginFailure(
    email: string | null,
    ipAddress: string,
    userAgent?: string,
    reason?: string
  ): Promise<void> {
    await this.log({
      eventType: AUDIT_EVENTS.LOGIN_FAILURE,
      email,
      ipAddress,
      userAgent,
      success: false,
      errorMessage: reason,
    });
  }

  /**
   * Log logout event
   */
  static async logLogout(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      eventType: AUDIT_EVENTS.LOGOUT,
      userId,
      email,
      ipAddress,
      userAgent,
      success: true,
    });
  }

  /**
   * Log account lockout due to failed attempts
   */
  static async logAccountLocked(
    userId: string,
    email: string,
    ipAddress: string,
    failedAttempts: number
  ): Promise<void> {
    await this.log({
      eventType: AUDIT_EVENTS.ACCOUNT_LOCKED,
      userId,
      email,
      ipAddress,
      success: true,
      metadata: { failedAttempts, reason: "max_attempts_exceeded" },
    });
  }

  /**
   * Log password change
   */
  static async logPasswordChanged(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      eventType: AUDIT_EVENTS.PASSWORD_CHANGED,
      userId,
      email,
      ipAddress,
      userAgent,
      success: true,
    });
  }

  /**
   * Log password reset request
   */
  static async logPasswordResetRequested(
    email: string,
    ipAddress: string,
    found: boolean
  ): Promise<void> {
    await this.log({
      eventType: AUDIT_EVENTS.PASSWORD_RESET_REQUESTED,
      email,
      ipAddress,
      success: true, // Always success to prevent enumeration
      metadata: { accountFound: found },
    });
  }

  /**
   * Log MFA events
   */
  static async logMfaEvent(
    userId: string,
    email: string,
    ipAddress: string,
    eventType: "enabled" | "disabled" | "success" | "failure",
    userAgent?: string
  ): Promise<void> {
    const eventMap = {
      enabled: AUDIT_EVENTS.MFA_ENABLED,
      disabled: AUDIT_EVENTS.MFA_DISABLED,
      success: AUDIT_EVENTS.MFA_CHALLENGE_SUCCESS,
      failure: AUDIT_EVENTS.MFA_CHALLENGE_FAILURE,
    };

    await this.log({
      eventType: eventMap[eventType],
      userId,
      email,
      ipAddress,
      userAgent,
      success: eventType !== "failure",
    });
  }

  /**
   * Log suspicious activity for security monitoring
   */
  static async logSuspiciousActivity(
    ipAddress: string,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType: AUDIT_EVENTS.SUSPICIOUS_ACTIVITY,
      ipAddress,
      success: false,
      errorMessage: description,
      metadata,
    });
  }

  /**
   * Log session invalidation (all sessions cleared)
   */
  static async logSessionsInvalidated(
    userId: string,
    email: string,
    ipAddress: string,
    reason: string
  ): Promise<void> {
    await this.log({
      eventType: AUDIT_EVENTS.SESSION_INVALIDATED,
      userId,
      email,
      ipAddress,
      success: true,
      metadata: { reason },
    });
  }
}

export default AuditLogger;
