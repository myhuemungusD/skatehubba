/**
 * Moderation Store — Report Operations
 */

import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { moderationReports } from "@shared/schema";
import type { ModerationReportInput } from "./types";

/**
 * Create a new moderation report
 *
 * Records a user-submitted report about problematic content or behavior.
 *
 * @param input - Report details
 * @returns Created report record
 */
export const createReport = async (input: ModerationReportInput) => {
  const db = getDb();
  const [report] = await db
    .insert(moderationReports)
    .values({
      reporterId: input.reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      notes: input.notes,
    })
    .returning();

  return report;
};

/**
 * List moderation reports with pagination
 *
 * Returns reports optionally filtered by status, ordered by creation date (newest first).
 *
 * @param status - Optional status filter (e.g., 'pending', 'resolved', 'dismissed')
 * @param page - Page number (1-indexed). Default: 1
 * @param limit - Reports per page. Default: 20
 * @returns Reports and total count
 */
export const listReports = async (status?: string, page = 1, limit = 20) => {
  const db = getDb();
  const offset = (page - 1) * limit;

  const conditions = status ? [eq(moderationReports.status, status)] : [];
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [reports, [totalRow]] = await Promise.all([
    db
      .select()
      .from(moderationReports)
      .where(whereClause)
      .orderBy(desc(moderationReports.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(moderationReports).where(whereClause),
  ]);

  return { reports, total: totalRow?.value ?? 0 };
};
