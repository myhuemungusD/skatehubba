import { z } from "zod";
import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  json,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

// Skater profiles table - extended user info
export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey(),
  handle: varchar("handle", { length: 50 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }),
  bio: text("bio"),
  photoURL: varchar("photo_url", { length: 500 }),
  stance: varchar("stance", { length: 20 }).default("regular"),
  homeSpot: varchar("home_spot", { length: 255 }),
  wins: integer("wins").default(0),
  losses: integer("losses").default(0),
  points: integer("points").default(0),
  // Dispute reputation: permanent, visible penalty count
  disputePenalties: integer("dispute_penalties").default(0).notNull(),
  roles: json("roles").$type<{ filmer?: boolean }>(),
  filmerRepScore: integer("filmer_rep_score").default(0),
  filmerVerified: boolean("filmer_verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Closet items table - collectible gear
export const closetItems = pgTable("closet_items", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  brand: varchar("brand", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  imageUrl: varchar("image_url", { length: 500 }).notNull(),
  rarity: varchar("rarity", { length: 50 }),
  acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
});

// Onboarding profiles — replaces Firestore profiles collection
export const onboardingProfiles = pgTable("onboarding_profiles", {
  uid: varchar("uid", { length: 255 }).primaryKey(),
  username: varchar("username", { length: 50 }).notNull(),
  stance: varchar("stance", { length: 20 }),
  experienceLevel: varchar("experience_level", { length: 20 }),
  favoriteTricks: json("favorite_tricks").$type<string[]>().notNull().default([]),
  bio: text("bio"),
  sponsorFlow: varchar("sponsor_flow", { length: 255 }),
  sponsorTeam: varchar("sponsor_team", { length: 255 }),
  hometownShop: varchar("hometown_shop", { length: 255 }),
  spotsVisited: integer("spots_visited").notNull().default(0),
  crewName: varchar("crew_name", { length: 100 }),
  credibilityScore: integer("credibility_score").notNull().default(0),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertClosetItemSchema = createInsertSchema(closetItems).omit({
  id: true,
  acquiredAt: true,
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type ClosetItem = typeof closetItems.$inferSelect;
export type InsertClosetItem = z.infer<typeof insertClosetItemSchema>;
export type OnboardingProfile = typeof onboardingProfiles.$inferSelect;
