import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  json,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Moderation tables — replaces Firestore moderation collections

export const moderationProfiles = pgTable("moderation_profiles", {
  userId: varchar("user_id", { length: 255 }).primaryKey(),
  trustLevel: integer("trust_level").notNull().default(0),
  reputationScore: integer("reputation_score").notNull().default(0),
  isBanned: boolean("is_banned").notNull().default(false),
  banExpiresAt: timestamp("ban_expires_at"),
  proVerificationStatus: varchar("pro_verification_status", { length: 20 })
    .notNull()
    .default("none"),
  isProVerified: boolean("is_pro_verified").notNull().default(false),
  proVerificationEvidence: json("pro_verification_evidence").$type<string[]>(),
  proVerificationNotes: text("pro_verification_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ModerationProfileRow = typeof moderationProfiles.$inferSelect;

export const moderationReports = pgTable(
  "moderation_reports",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reporterId: varchar("reporter_id", { length: 255 }).notNull(),
    targetType: varchar("target_type", { length: 20 }).notNull(),
    targetId: varchar("target_id", { length: 255 }).notNull(),
    reason: varchar("reason", { length: 100 }).notNull(),
    notes: text("notes"),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("IDX_moderation_reports_status").on(table.status),
    reporterIdx: index("IDX_moderation_reports_reporter").on(table.reporterId),
    createdAtIdx: index("IDX_moderation_reports_created").on(table.createdAt),
  })
);

export type ModerationReport = typeof moderationReports.$inferSelect;

export const modActions = pgTable(
  "mod_actions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    adminId: varchar("admin_id", { length: 255 }).notNull(),
    targetUserId: varchar("target_user_id", { length: 255 }).notNull(),
    actionType: varchar("action_type", { length: 20 }).notNull(),
    reasonCode: varchar("reason_code", { length: 50 }).notNull(),
    notes: text("notes"),
    reversible: boolean("reversible").notNull().default(true),
    expiresAt: timestamp("expires_at"),
    relatedReportId: varchar("related_report_id", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    targetIdx: index("IDX_mod_actions_target").on(table.targetUserId),
    adminIdx: index("IDX_mod_actions_admin").on(table.adminId),
  })
);

export type ModAction = typeof modActions.$inferSelect;

export const moderationQuotas = pgTable(
  "moderation_quotas",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    dateKey: varchar("date_key", { length: 10 }).notNull(),
    count: integer("count").notNull().default(0),
    limit: integer("quota_limit").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userActionDateIdx: uniqueIndex("unique_moderation_quota").on(
      table.userId,
      table.action,
      table.dateKey
    ),
  })
);

export type ModerationQuota = typeof moderationQuotas.$inferSelect;

export const posts = pgTable(
  "posts",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    content: json("content").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("IDX_posts_user").on(table.userId),
    statusIdx: index("IDX_posts_status").on(table.status),
  })
);

export type Post = typeof posts.$inferSelect;
