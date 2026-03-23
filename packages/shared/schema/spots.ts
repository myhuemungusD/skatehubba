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
  doublePrecision,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Spot types
export const SPOT_TYPES = [
  "rail", "ledge", "stairs", "gap", "bank", "manual-pad",
  "flat", "bowl", "mini-ramp", "vert", "diy", "park", "street", "other",
] as const;
export type SpotType = (typeof SPOT_TYPES)[number];

export const SPOT_TIERS = ["bronze", "silver", "gold", "legendary"] as const;
export type SpotTier = (typeof SPOT_TIERS)[number];

/**
 * Skate spots — the map layer.
 * Stripped for MVP: no filmer requests, no nonces, no daily counters.
 */
export const spots = pgTable(
  "spots",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    spotType: varchar("spot_type", { length: 50 }).default("street"),
    tier: varchar("tier", { length: 20 }).default("bronze"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    address: text("address"),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 50 }),
    country: varchar("country", { length: 100 }).default("USA"),
    photoUrl: text("photo_url"),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    verified: boolean("verified").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    checkInCount: integer("check_in_count").notNull().default(0),
    rating: doublePrecision("rating").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
  },
  (table) => ({
    locationIdx: index("IDX_spot_location").on(table.lat, table.lng),
    cityIdx: index("IDX_spot_city").on(table.city),
    createdByIdx: index("IDX_spot_created_by").on(table.createdBy),
  })
);

export const spotRatings = pgTable(
  "spot_ratings",
  {
    id: serial("id").primaryKey(),
    spotId: integer("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 }).notNull(),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserSpot: uniqueIndex("unique_spot_rating_per_user").on(table.spotId, table.userId),
    spotIdx: index("IDX_spot_ratings_spot").on(table.spotId),
  })
);

/**
 * Check-ins — simplified. No AR, no filmer, no nonce.
 */
export const checkIns = pgTable(
  "check_ins",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    spotId: integer("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("IDX_check_ins_user").on(table.userId),
    spotIdx: index("IDX_check_ins_spot").on(table.spotId),
  })
);

// Validation
export const insertSpotSchema = createInsertSchema(spots, {
  name: z.string().trim().min(1, "Spot name is required").max(100, "Name too long"),
  description: z.string().trim().max(1000, "Description too long").optional(),
  spotType: z.enum(SPOT_TYPES).optional(),
  tier: z.enum(SPOT_TIERS).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  country: z.string().trim().max(100).optional(),
  photoUrl: z.string().url("Valid image URL required").optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  verified: true,
  isActive: true,
  checkInCount: true,
  rating: true,
  ratingCount: true,
  createdBy: true,
});

// Types
export type Spot = typeof spots.$inferSelect;
export type InsertSpot = z.infer<typeof insertSpotSchema>;
export type SpotRating = typeof spotRatings.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
