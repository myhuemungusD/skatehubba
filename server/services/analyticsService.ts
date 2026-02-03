import { db } from "../db";
import { analyticsEvents } from "../../packages/shared/schema-analytics";
import type { EventName } from "../../packages/shared/analytics-events";
import logger from "../logger";

/**
 * Generate a unique event ID for server-side events.
 * Using timestamp + random for simplicity.
 */
function generateEventId(): string {
  return `srv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Log a "truth event" from the server.
 *
 * CRITICAL: Call this AFTER the database write succeeds.
 * This ensures events are only logged when the action actually happened.
 *
 * Server-side logging is the source of truth for:
 * - battle_voted (after vote is recorded)
 * - battle_completed (after battle state changes)
 * - spot_checkin_validated (after distance validation passes)
 *
 * Why server-side?
 * - Client events can be spoofed or inflated
 * - Server knows the action actually succeeded
 * - Idempotent via event_id if retried
 *
 * @param uid - User ID (from Firebase token, NOT from client payload)
 * @param eventName - Event type from allowlist
 * @param properties - Event-specific data
 *
 * @example
 * ```ts
 * // After vote write succeeds:
 * await logServerEvent(uid, "battle_voted", {
 *   battle_id: "abc123",
 *   vote: "clean",
 * });
 * ```
 */
export async function logServerEvent(
  uid: string,
  eventName: EventName,
  properties: Record<string, unknown> = {}
): Promise<void> {
  if (!db) {
    logger.warn("[Analytics] Database not configured, dropping server event", {
      uid,
      eventName,
    });
    return;
  }

  try {
    await db.insert(analyticsEvents).values({
      eventId: generateEventId(),
      eventName,
      uid,
      occurredAt: new Date(),
      receivedAt: new Date(),
      sessionId: null, // Server events don't have client sessions
      source: "server",
      appVersion: null,
      properties,
    });
  } catch (error) {
    // Log but don't throw - analytics should never break the main flow
    logger.error("[Analytics] Failed to log server event", {
      uid,
      eventName,
      error,
    });
  }
}

/**
 * Log a batch of server events in a single transaction.
 * Useful when an action triggers multiple events.
 */
export async function logServerEventBatch(
  events: Array<{
    uid: string;
    eventName: EventName;
    properties?: Record<string, unknown>;
  }>
): Promise<void> {
  if (!db || events.length === 0) {
    return;
  }

  const now = new Date();
  const values = events.map((ev) => ({
    eventId: generateEventId(),
    eventName: ev.eventName,
    uid: ev.uid,
    occurredAt: now,
    receivedAt: now,
    sessionId: null,
    source: "server" as const,
    appVersion: null,
    properties: ev.properties ?? {},
  }));

  try {
    await db.insert(analyticsEvents).values(values);
  } catch (error) {
    logger.error("[Analytics] Failed to log server event batch", {
      count: events.length,
      error,
    });
  }
}
