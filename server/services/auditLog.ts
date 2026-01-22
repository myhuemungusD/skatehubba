import { createChildLogger } from "../logger";

type AuditContext = {
  userId?: string;
  ip?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
};

const auditLogger = createChildLogger({ channel: "audit" });

export const logAuditEvent = (context: AuditContext) => {
  const payload = {
    userId: context.userId,
    ip: context.ip,
    action: context.action,
    ...(context.metadata ? { metadata: context.metadata } : {}),
  };

  auditLogger.info("Audit event", payload);
};
