import { z } from "zod";
import {
  pgTable,
  text,
  integer,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { customUsers } from "./auth";

/**
 * Skater profiles — extended user info for the platform.
 * Stripped to MVP: handle, display, stance, stats. No closet, no filmer, no XP.
 */
export const userProfiles = pgTable("user_profiles", {
  id: varchar("id")
    .primaryKey()
    .references(() => customUsers.id, { onDelete: "cascade" }),
  handle: varchar("handle", { length: 50 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }),
  bio: text("bio"),
  photoURL: varchar("photo_url", { length: 500 }),
  stance: varchar("stance", { length: 20 }).default("regular"),
  homeSpot: varchar("home_spot", { length: 255 }),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  createdAt: true,
  updatedAt: true,
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
