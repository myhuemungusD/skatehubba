import type { Request, Response, NextFunction } from "express";
import { createChildLogger } from "../logger";

/**
 * Audit event categories for structured logging.
 * These map to security-relevant actions that should be traceable.
 */
export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.signup"
  | "auth.password_reset"
  | "auth.email_change"
  | "auth.reauth"
  | "profile.create"
  | "profile.update"
  | "profile.delete"
  | "admin.role_change"
  | "admin.user_ban"
  | "admin.config_change"
  | "admin.data_export"
  | "payment.subscription_change"
  | "payment.refund"
  | "content.report"
  | "content.moderate"
  | "spot.create"
  | "spot.delete";

interface AuditEntry {
  action: AuditAction;
  userId?: string;
  targetId?: string;
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  statusCode?: number;
  detail?: string;
}

const auditLogger = createChildLogger({ module: "audit" });

/**
 * Emit a structured audit log entry.
 * Use this directly when you need to log an event outside of middleware context.
 */
export function emitAuditLog(entry: AuditEntry): void {
  auditLogger.info(`[AUDIT] ${entry.action}`, {
    action: entry.action,
    userId: entry.userId ?? "anonymous",
    targetId: entry.targetId,
    ip: entry.ip,
    userAgent: entry.userAgent,
    method: entry.method,
    path: entry.path,
    statusCode: entry.statusCode,
    detail: entry.detail,
  });
}

/**
 * Express middleware factory that automatically logs an audit event
 * after the response is sent. Attach to security-sensitive routes.
 *
 * @example
 *   router.post("/admin/ban-user", auditMiddleware("admin.user_ban"), handler);
 */
export function auditMiddleware(action: AuditAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => {
      emitAuditLog({
        action,
        userId: req.currentUser?.id,
        targetId: req.params.id ?? req.params.userId,
        ip: req.ip ?? "unknown",
        userAgent: req.get("user-agent") ?? "unknown",
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
      });
    });
    next();
  };
}
