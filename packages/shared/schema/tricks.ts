import { z } from "zod";
import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Trick clips status
export const CLIP_STATUSES = ["processing", "ready", "failed", "flagged"] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

export const tricks = pgTable("tricks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  likesCount: integer("likes_count").default(0).notNull(),
});

// Trick Mastery table for progression
export const trickMastery = pgTable(
  "trick_mastery",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    trick: varchar("trick", { length: 100 }).notNull(),
    level: varchar("level", { length: 50 }).notNull().default("learning"), // 'learning', 'consistent', 'bolts'
    landedCount: integer("landed_count").default(0).notNull(),
    lastLandedAt: timestamp("last_landed_at"),
    streak: integer("streak").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userTrickIdx: index("IDX_user_trick").on(table.userId, table.trick),
  })
);

// TrickMint — video upload pipeline for standalone trick clips
export const trickClips = pgTable(
  "trick_clips",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    userName: varchar("user_name", { length: 255 }).notNull(),
    trickName: varchar("trick_name", { length: 200 }).notNull(),
    description: text("description"),
    videoUrl: varchar("video_url", { length: 500 }).notNull(),
    videoDurationMs: integer("video_duration_ms"),
    thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
    fileSizeBytes: integer("file_size_bytes"),
    mimeType: varchar("mime_type", { length: 100 }),
    status: varchar("status", { length: 50 }).notNull().default("processing"),
    // Optional links to game/spot context
    spotId: integer("spot_id"),
    gameId: varchar("game_id", { length: 255 }),
    gameTurnId: integer("game_turn_id"),
    // Engagement
    views: integer("views").default(0).notNull(),
    likes: integer("likes").default(0).notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("IDX_trick_clips_user").on(table.userId),
    statusIdx: index("IDX_trick_clips_status").on(table.status),
    publicFeedIdx: index("IDX_trick_clips_public_feed").on(
      table.isPublic,
      table.status,
      table.createdAt
    ),
    gameIdx: index("IDX_trick_clips_game").on(table.gameId),
  })
);

export const insertTrickMasterySchema = createInsertSchema(trickMastery).omit({
  id: true,
  updatedAt: true,
});

export const insertTrickClipSchema = createInsertSchema(trickClips).omit({
  id: true,
  views: true,
  likes: true,
  createdAt: true,
  updatedAt: true,
});

export type Trick = typeof tricks.$inferSelect;
export type InsertTrick = typeof tricks.$inferInsert;
export type TrickMastery = typeof trickMastery.$inferSelect;
export type InsertTrickMastery = z.infer<typeof insertTrickMasterySchema>;
export type TrickClip = typeof trickClips.$inferSelect;
export type InsertTrickClip = z.infer<typeof insertTrickClipSchema>;
