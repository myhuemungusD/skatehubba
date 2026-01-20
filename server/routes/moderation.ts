import { Router } from "express";
import { z } from "zod";
import { authenticateUser, requireAdmin } from "../auth/middleware";
import {
  enforceAdminRateLimit,
  enforceNotBanned,
  enforceTrustAction,
} from "../middleware/trustSafety";
import {
  applyModerationAction,
  createReport,
  listReports,
  setProVerificationStatus,
} from "../services/moderationStore";

export const moderationRouter = Router();

const reportSchema = z.object({
  targetType: z.enum(["user", "post", "checkin", "comment"]),
  targetId: z.string().min(1).max(128),
  reason: z.string().min(3).max(100),
  notes: z.string().max(500).optional(),
});

moderationRouter.post(
  "/report",
  authenticateUser,
  enforceTrustAction("report"),
  async (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_REPORT", issues: parsed.error.flatten() });
    }

    const reporterId = req.currentUser?.id;
    if (!reporterId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const report = await createReport({
      reporterId,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      notes: parsed.data.notes ?? null,
    });

    return res.status(201).json({ reportId: report.id });
  }
);

moderationRouter.get(
  "/admin/reports",
  authenticateUser,
  requireAdmin,
  enforceAdminRateLimit(),
  enforceNotBanned(),
  async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const reports = await listReports(status);
    return res.status(200).json({ reports });
  }
);

const modActionSchema = z.object({
  targetUserId: z.string().min(1),
  actionType: z.enum([
    "warn",
    "remove_content",
    "temp_ban",
    "perm_ban",
    "verify_pro",
    "revoke_pro",
  ]),
  reasonCode: z.string().min(2).max(50),
  notes: z.string().max(500).optional(),
  reversible: z.boolean().default(true),
  expiresAt: z.string().datetime().optional(),
  relatedReportId: z.string().max(128).optional(),
});

moderationRouter.post(
  "/admin/mod-action",
  authenticateUser,
  requireAdmin,
  enforceAdminRateLimit(),
  enforceNotBanned(),
  async (req, res) => {
    const parsed = modActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_MOD_ACTION", issues: parsed.error.flatten() });
    }

    const adminId = req.currentUser?.id;
    if (!adminId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const result = await applyModerationAction({
      adminId,
      targetUserId: parsed.data.targetUserId,
      actionType: parsed.data.actionType,
      reasonCode: parsed.data.reasonCode,
      notes: parsed.data.notes ?? null,
      reversible: parsed.data.reversible,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      relatedReportId: parsed.data.relatedReportId ?? null,
    });

    return res.status(200).json({ modActionId: result.id });
  }
);

const proVerificationSchema = z.object({
  userId: z.string().min(1),
  status: z.enum(["none", "pending", "verified", "rejected"]),
  evidence: z.array(z.string().min(3).max(200)).default([]),
  notes: z.string().max(500).optional(),
});

moderationRouter.post(
  "/admin/pro-verify",
  authenticateUser,
  requireAdmin,
  enforceAdminRateLimit(),
  enforceNotBanned(),
  async (req, res) => {
    const parsed = proVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "INVALID_PRO_VERIFICATION", issues: parsed.error.flatten() });
    }

    const adminId = req.currentUser?.id;
    if (!adminId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const log = await setProVerificationStatus({
      adminId,
      userId: parsed.data.userId,
      status: parsed.data.status,
      evidence: parsed.data.evidence,
      notes: parsed.data.notes ?? null,
    });

    return res.status(200).json({ modActionId: log.id });
  }
);
