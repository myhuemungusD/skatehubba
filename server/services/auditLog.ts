/**
 * Audit Log Service
 *
 * Provides structured audit trail logging for security-relevant actions.
 * All audit events are logged to a dedicated channel with consistent formatting.
 *
 * @module services/auditLog
 */

import { createChildLogger } from "../logger";

/**
 * Context information for an audit event
 */
type AuditContext = {
  /** User ID who performed the action */
  userId?: string;
  /** IP address from which the action was performed */
  ip?: string | null;
  /** Action name or description */
  action: string;
  /** Additional context-specific metadata */
  metadata?: Record<string, unknown>;
};

const auditLogger = createChildLogger({ channel: "audit" });

/**
 * Log an audit event with structured context
 *
 * Creates a permanent audit trail record for security-relevant actions such as:
 * - Authentication attempts (login, logout, password reset)
 * - Authorization changes (role assignments, permission grants)
 * - Data access (viewing sensitive information)
 * - Data modifications (creating, updating, deleting records)
 * - Admin actions (moderation, user management)
 *
 * @param context - Audit event context containing user, action, and metadata
 *
 * @example
 * ```typescript
 * logAuditEvent({
 *   userId: 'user_123',
 *   ip: '192.168.1.1',
 *   action: 'user_login',
 *   metadata: { method: 'email', success: true }
 * });
 * ```
 *
 * @example
 * ```typescript
 * logAuditEvent({
 *   userId: 'admin_456',
 *   ip: '10.0.0.5',
 *   action: 'user_ban',
 *   metadata: { targetUserId: 'user_789', reason: 'spam', duration: '7d' }
 * });
 * ```
 */
export const logAuditEvent = (context: AuditContext) => {
  const payload = {
    userId: context.userId,
    ip: context.ip,
    action: context.action,
    ...(context.metadata ? { metadata: context.metadata } : {}),
  };

  auditLogger.info("Audit event", payload);
};
