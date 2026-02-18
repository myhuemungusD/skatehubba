import {
  pgTable,
  text,
  serial,
  boolean,
  timestamp,
  json,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Notification types enum
export const NOTIFICATION_TYPES = [
  "challenge_received",
  "your_turn",
  "game_over",
  "opponent_forfeited",
  "game_forfeited_timeout",
  "deadline_warning",
  "dispute_filed",
  "welcome",
  "payment_receipt",
  "weekly_digest",
  "quick_match",
  "system",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["push", "email", "in_app"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// Notifications table — in-app notification feed
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    data: json("data").$type<Record<string, unknown>>(),
    channel: varchar("channel", { length: 20 }).notNull().default("in_app"),
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("IDX_notifications_user").on(table.userId),
    userUnreadIdx: index("IDX_notifications_user_unread").on(table.userId, table.isRead),
    createdAtIdx: index("IDX_notifications_created_at").on(table.createdAt),
  })
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// Notification preferences — per-user opt-in/out per type+channel
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    // Push notification channels
    pushEnabled: boolean("push_enabled").default(true).notNull(),
    emailEnabled: boolean("email_enabled").default(true).notNull(),
    inAppEnabled: boolean("in_app_enabled").default(true).notNull(),
    // Per-category toggles
    gameNotifications: boolean("game_notifications").default(true).notNull(),
    challengeNotifications: boolean("challenge_notifications").default(true).notNull(),
    turnNotifications: boolean("turn_notifications").default(true).notNull(),
    resultNotifications: boolean("result_notifications").default(true).notNull(),
    marketingEmails: boolean("marketing_emails").default(true).notNull(),
    weeklyDigest: boolean("weekly_digest").default(true).notNull(),
    // Quiet hours (stored as HH:MM in user's local time)
    quietHoursStart: varchar("quiet_hours_start", { length: 5 }),
    quietHoursEnd: varchar("quiet_hours_end", { length: 5 }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: uniqueIndex("unique_notification_prefs_user").on(table.userId),
  })
);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;

/** Public-facing notification preferences (no internal DB fields). */
export interface NotificationPrefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  gameNotifications: boolean;
  challengeNotifications: boolean;
  turnNotifications: boolean;
  resultNotifications: boolean;
  marketingEmails: boolean;
  weeklyDigest: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  pushEnabled: true,
  emailEnabled: true,
  inAppEnabled: true,
  gameNotifications: true,
  challengeNotifications: true,
  turnNotifications: true,
  resultNotifications: true,
  marketingEmails: true,
  weeklyDigest: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};

/** Notification type classification helpers */
const GAME_TYPES: ReadonlySet<NotificationType> = new Set([
  "challenge_received",
  "your_turn",
  "game_over",
  "opponent_forfeited",
  "game_forfeited_timeout",
  "deadline_warning",
  "dispute_filed",
  "quick_match",
]);

const CHALLENGE_TYPES: ReadonlySet<NotificationType> = new Set([
  "challenge_received",
  "quick_match",
]);

const TURN_TYPES: ReadonlySet<NotificationType> = new Set(["your_turn", "deadline_warning"]);

const RESULT_TYPES: ReadonlySet<NotificationType> = new Set([
  "game_over",
  "opponent_forfeited",
  "game_forfeited_timeout",
]);

/** Check whether a notification should be sent based on user preferences. */
export function shouldSendForType(
  prefs: Pick<
    NotificationPrefs,
    "gameNotifications" | "challengeNotifications" | "turnNotifications" | "resultNotifications"
  >,
  type: NotificationType
): boolean {
  if (GAME_TYPES.has(type) && !prefs.gameNotifications) return false;
  if (CHALLENGE_TYPES.has(type) && !prefs.challengeNotifications) return false;
  if (TURN_TYPES.has(type) && !prefs.turnNotifications) return false;
  if (RESULT_TYPES.has(type) && !prefs.resultNotifications) return false;
  return true;
}

/**
 * Check if the current time falls within the user's quiet hours.
 * Quiet hours are stored as "HH:MM" strings in the user's local time.
 *
 * Returns true if current time IS within quiet hours (notifications should be suppressed).
 * Supports overnight ranges (e.g., start="22:00", end="07:00").
 *
 * @param quietHoursStart - Start time in "HH:MM" format, or null if unset
 * @param quietHoursEnd - End time in "HH:MM" format, or null if unset
 * @param currentTimeHHMM - Optional override for testing (defaults to current UTC HH:MM)
 */
export function isWithinQuietHours(
  quietHoursStart: string | null,
  quietHoursEnd: string | null,
  currentTimeHHMM?: string
): boolean {
  if (!quietHoursStart || !quietHoursEnd) return false;

  const now = currentTimeHHMM ?? new Date().toISOString().slice(11, 16);

  if (quietHoursStart <= quietHoursEnd) {
    // Same-day range (e.g., 09:00–17:00)
    return now >= quietHoursStart && now < quietHoursEnd;
  } else {
    // Overnight range (e.g., 22:00–07:00)
    return now >= quietHoursStart || now < quietHoursEnd;
  }
}
