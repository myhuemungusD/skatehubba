import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Analytics Events Table
 *
 * Stores all tracked events with idempotency protection.
 *
 * Key design decisions:
 * - event_id is PK for idempotency (client generates ULID/UUID)
 * - uid is derived server-side from Firebase token (never trust client)
 * - occurred_at is client timestamp, received_at is server timestamp
 * - properties is JSONB for flexible event-specific data
 *
 * Indexes optimized for:
 * - User activity queries (uid + occurred_at)
 * - Event type analysis (event_name + occurred_at)
 * - Time-range queries (occurred_at)
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    // Idempotency key - client generates ULID/UUID
    eventId: text("event_id").primaryKey(),

    // Event type from allowlist
    eventName: text("event_name").notNull(),

    // User ID derived from Firebase token (server-side only)
    uid: text("uid").notNull(),

    // When the event occurred (client timestamp)
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    // When we received it (server timestamp)
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),

    // Session tracking
    sessionId: text("session_id"),

    // Platform info
    source: text("source"), // web, ios, android
    appVersion: text("app_version"),

    // Event-specific properties (validated per event type)
    properties: jsonb("properties").notNull().default({}),
  },
  (t) => ({
    // User activity queries: "show me user X's events"
    uidOccurredIdx: index("analytics_uid_occurred_idx").on(t.uid, t.occurredAt),

    // Event analysis: "show me all battle_voted events"
    nameOccurredIdx: index("analytics_name_occurred_idx").on(t.eventName, t.occurredAt),

    // Time-range queries: "events in last 7 days"
    occurredIdx: index("analytics_occurred_idx").on(t.occurredAt),

    // Explicit uniqueness (PK already ensures this, but explicit for clarity)
    eventIdUnique: uniqueIndex("analytics_event_id_unique").on(t.eventId),
  })
);

/**
 * Type for inserting analytics events
 */
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;

/**
 * Type for selecting analytics events
 */
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;

/*
 * RAW SQL MIGRATION (if you prefer manual migrations):
 *
 * CREATE TABLE IF NOT EXISTS analytics_events (
 *   event_id TEXT PRIMARY KEY,
 *   event_name TEXT NOT NULL,
 *   uid TEXT NOT NULL,
 *   occurred_at TIMESTAMPTZ NOT NULL,
 *   received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   session_id TEXT,
 *   source TEXT,
 *   app_version TEXT,
 *   properties JSONB NOT NULL DEFAULT '{}'::jsonb
 * );
 *
 * CREATE INDEX IF NOT EXISTS analytics_uid_occurred_idx ON analytics_events (uid, occurred_at);
 * CREATE INDEX IF NOT EXISTS analytics_name_occurred_idx ON analytics_events (event_name, occurred_at);
 * CREATE INDEX IF NOT EXISTS analytics_occurred_idx ON analytics_events (occurred_at);
 */
