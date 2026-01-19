import { z } from "zod";

/**
 * Analytics Event Contract
 *
 * IMPORTANT RULES:
 * 1. Do not trust client user_id (server derives UID from Firebase ID token)
 * 2. Server logs "truth events" inside action handlers, not from UI
 * 3. Idempotency via event_id prevents retry inflation
 *
 * Keep event names stable forever. Add events; never rename.
 */

export const EVENT_NAMES = [
  // Battle loop (truth + UX)
  "battle_created",
  "battle_joined",
  "battle_response_uploaded",
  "battle_voted",
  "battle_completed",

  // Supporting loop
  "clip_uploaded",
  "clip_exported",
  "crew_created",
  "crew_joined",
  "spot_checkin_validated",

  // Session-ish (optional but useful)
  "app_opened",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export const EventNameSchema = z.enum(EVENT_NAMES);

/**
 * Client -> Server payload.
 * IMPORTANT: no user_id here. Server derives UID from Firebase token.
 */
export const AnalyticsIngestSchema = z
  .object({
    event_id: z.string().min(10), // ULID/UUID generated client-side for idempotency
    event_name: EventNameSchema,
    occurred_at: z.string().datetime(), // ISO
    session_id: z.string().min(10).optional(), // persistent per session
    source: z.enum(["web", "ios", "android"]).optional(),
    app_version: z.string().max(50).optional(),
    properties: z.record(z.unknown()).default({}),
  })
  .strict();

export type AnalyticsIngest = z.infer<typeof AnalyticsIngestSchema>;

export const AnalyticsBatchSchema = z.array(AnalyticsIngestSchema).max(100);

export type AnalyticsBatch = z.infer<typeof AnalyticsBatchSchema>;

/**
 * Property validation per event (tighten over time).
 * Start strict where it matters (battle + voting).
 */
export const BattleCreatedProps = z
  .object({
    battle_id: z.string().min(1),
    matchmaking: z.enum(["open", "direct"]).optional(),
    opponent_id: z.string().min(1).optional(),
    stance: z.enum(["regular", "goofy"]).optional(),
    skill: z.string().max(32).optional(),
  })
  .strict();

export const BattleVotedProps = z
  .object({
    battle_id: z.string().min(1),
    vote: z.enum(["clean", "sketch", "redo"]),
  })
  .strict();

export const BattleJoinedProps = z
  .object({
    battle_id: z.string().min(1),
    creator_id: z.string().min(1).optional(),
  })
  .strict();

export const BattleCompletedProps = z
  .object({
    battle_id: z.string().min(1),
    winner_id: z.string().min(1).optional(),
    total_rounds: z.number().int().positive().optional(),
  })
  .strict();

export const ClipUploadedProps = z
  .object({
    clip_id: z.string().min(1),
    trick_name: z.string().max(100).optional(),
    spot_id: z.string().min(1).optional(),
  })
  .strict();

export const SpotCheckinProps = z
  .object({
    spot_id: z.string().min(1),
    streak_day: z.number().int().nonnegative().optional(),
  })
  .strict();

export const CrewJoinedProps = z
  .object({
    crew_id: z.string().min(1),
    invite_code: z.string().optional(),
  })
  .strict();

/**
 * Validate event properties based on event name.
 * Throws ZodError if validation fails.
 */
export function validateEventProps(
  event_name: EventName,
  properties: Record<string, unknown>
): Record<string, unknown> {
  switch (event_name) {
    case "battle_created":
      return BattleCreatedProps.parse(properties);
    case "battle_voted":
      return BattleVotedProps.parse(properties);
    case "battle_joined":
      return BattleJoinedProps.parse(properties);
    case "battle_completed":
      return BattleCompletedProps.parse(properties);
    case "clip_uploaded":
      return ClipUploadedProps.parse(properties);
    case "spot_checkin_validated":
      return SpotCheckinProps.parse(properties);
    case "crew_joined":
      return CrewJoinedProps.parse(properties);
    default:
      // Gradually tighten others as needed
      return properties;
  }
}
