import type { Request, Response } from "express";
import { Router } from "express";
import {
  AnalyticsBatchSchema,
  AnalyticsIngestSchema,
  type AnalyticsBatch,
  type AnalyticsIngest,
  validateEventProps,
} from "../../packages/shared/analytics-events";
import { requireFirebaseUid, type FirebaseAuthedRequest } from "../middleware/firebaseUid";
import { db } from "../db";
import { analyticsEvents } from "../../packages/shared/schema-analytics";
import logger from "../logger";
import { validateBody } from "../middleware/validation";

export const analyticsRouter = Router();

/**
 * POST /api/analytics/events
 *
 * Ingest analytics events from clients.
 *
 * Security:
 * - Auth required (Firebase ID token)
 * - Server derives UID from token (never trust client)
 * - Validates event name against allowlist
 * - Validates per-event properties where strict
 * - Idempotent on event_id (PK) - retries don't inflate metrics
 */
analyticsRouter.post(
  "/events",
  requireFirebaseUid,
  validateBody(AnalyticsIngestSchema, { errorCode: "invalid_event" }),
  async (req: Request, res: Response) => {
    const uid = (req as FirebaseAuthedRequest).firebaseUid;

    const ev = req.body as AnalyticsIngest;

    // Validate per-event properties (strict where it matters)
    let props: Record<string, unknown>;
    try {
      props = validateEventProps(ev.event_name, ev.properties);
    } catch (validationError) {
      logger.warn("[Analytics] Invalid event properties", {
        uid,
        event_name: ev.event_name,
        error: validationError,
      });
      return res.status(400).json({ error: "invalid_properties" });
    }

    // Check if DB is available
    if (!db) {
      logger.warn("[Analytics] Database not configured, dropping event", {
        uid,
        event_name: ev.event_name,
      });
      // Return success to not break client - just log the drop
      return res.status(204).send();
    }

    try {
      await db
        .insert(analyticsEvents)
        .values({
          eventId: ev.event_id,
          eventName: ev.event_name,
          uid,
          occurredAt: new Date(ev.occurred_at),
          sessionId: ev.session_id ?? null,
          source: ev.source ?? null,
          appVersion: ev.app_version ?? null,
          properties: props,
        })
        .onConflictDoNothing(); // Idempotent - duplicate event_id is ignored

      return res.status(204).send();
    } catch (dbError) {
      logger.error("[Analytics] Event insert failed", {
        uid,
        event_id: ev.event_id,
        error: dbError,
      });
      return res.status(500).json({ error: "event_insert_failed" });
    }
  }
);

/**
 * POST /api/analytics/events/batch
 *
 * Batch ingest multiple events (useful for offline sync).
 * Same security rules as single event endpoint.
 */
analyticsRouter.post(
  "/events/batch",
  requireFirebaseUid,
  validateBody(AnalyticsBatchSchema, { errorCode: "invalid_event" }),
  async (req: Request, res: Response) => {
    const uid = (req as FirebaseAuthedRequest).firebaseUid;

    // Defensive runtime check to avoid type confusion on req.body
    const body = req.body;
    if (!Array.isArray(body) || body.some((item) => item === null || typeof item !== "object")) {
      logger.warn("[Analytics] Invalid batch payload type", {
        uid,
        payloadType: typeof body,
      });
      return res.status(400).json({ error: "invalid_event" });
    }

    const batch = body as AnalyticsBatch;

    if (!db) {
      logger.warn("[Analytics] Database not configured, dropping batch", {
        uid,
        count: batch.length,
      });
      return res.status(204).send();
    }

    const validEvents: Array<{
      eventId: string;
      eventName: string;
      uid: string;
      occurredAt: Date;
      sessionId: string | null;
      source: string | null;
      appVersion: string | null;
      properties: Record<string, unknown>;
    }> = [];

    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < batch.length; i++) {
      const ev = batch[i];

      try {
        const props = validateEventProps(ev.event_name, ev.properties);

        validEvents.push({
          eventId: ev.event_id,
          eventName: ev.event_name,
          uid,
          occurredAt: new Date(ev.occurred_at),
          sessionId: ev.session_id ?? null,
          source: ev.source ?? null,
          appVersion: ev.app_version ?? null,
          properties: props,
        });
      } catch {
        errors.push({ index: i, error: "invalid_properties" });
        continue;
      }
    }

    if (validEvents.length > 0) {
      try {
        await db.insert(analyticsEvents).values(validEvents).onConflictDoNothing();
      } catch (dbError) {
        logger.error("[Analytics] Batch insert failed", {
          uid,
          count: validEvents.length,
          error: dbError,
        });
        return res.status(500).json({ error: "batch_insert_failed" });
      }
    }

    return res.status(200).json({
      accepted: validEvents.length,
      rejected: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  }
);
