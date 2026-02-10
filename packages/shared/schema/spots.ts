import { z } from "zod";
import {
  pgEnum,
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
import { sql } from "drizzle-orm";
import { customUsers } from "./auth";

// Spot types enum
export const SPOT_TYPES = [
  "rail",
  "ledge",
  "stairs",
  "gap",
  "bank",
  "manual-pad",
  "flat",
  "bowl",
  "mini-ramp",
  "vert",
  "diy",
  "park",
  "street",
  "other",
] as const;
export type SpotType = (typeof SPOT_TYPES)[number];

// Spot tiers for difficulty/quality
export const SPOT_TIERS = ["bronze", "silver", "gold", "legendary"] as const;
export type SpotTier = (typeof SPOT_TIERS)[number];

// Skate spots table for map
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
    thumbnailUrl: text("thumbnail_url"),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    verified: boolean("verified").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    checkInCount: integer("check_in_count").default(0).notNull(),
    rating: doublePrecision("rating").default(0),
    ratingCount: integer("rating_count").default(0).notNull(),
  },
  (table) => ({
    locationIdx: index("IDX_spot_location").on(table.lat, table.lng),
    cityIdx: index("IDX_spot_city").on(table.city),
    createdByIdx: index("IDX_spot_created_by").on(table.createdBy),
  })
);

export const filmerRequestStatusEnum = pgEnum("filmer_request_status", [
  "pending",
  "accepted",
  "rejected",
]);

export const checkIns = pgTable(
  "check_ins",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    spotId: integer("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    isAr: boolean("is_ar").notNull().default(false),
    filmerUid: varchar("filmer_uid", { length: 128 }),
    filmerStatus: filmerRequestStatusEnum("filmer_status"),
    filmerRequestedAt: timestamp("filmer_requested_at"),
    filmerRespondedAt: timestamp("filmer_responded_at"),
    filmerRequestId: varchar("filmer_request_id", { length: 64 }),
  },
  (table) => ({
    oneCheckInPerDay: uniqueIndex("unique_check_in_per_day").on(
      table.userId,
      table.spotId,
      sql`DATE(${table.timestamp})`
    ),
    userIdx: index("IDX_check_ins_user").on(table.userId),
    spotIdx: index("IDX_check_ins_spot").on(table.spotId),
  })
);

export const filmerRequests = pgTable(
  "filmer_requests",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    checkInId: integer("check_in_id")
      .notNull()
      .references(() => checkIns.id, { onDelete: "cascade" }),
    requesterId: varchar("requester_id", { length: 255 })
      .notNull()
      .references(() => customUsers.id, { onDelete: "cascade" }),
    filmerId: varchar("filmer_id", { length: 255 })
      .notNull()
      .references(() => customUsers.id, { onDelete: "cascade" }),
    status: filmerRequestStatusEnum("status").notNull().default("pending"),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    respondedAt: timestamp("responded_at"),
  },
  (table) => ({
    checkInFilmerIdx: uniqueIndex("unique_filmer_request").on(table.checkInId, table.filmerId),
    statusIdx: index("IDX_filmer_requests_status").on(table.status),
    requesterIdx: index("IDX_filmer_requests_requester").on(table.requesterId),
    filmerIdx: index("IDX_filmer_requests_filmer").on(table.filmerId),
  })
);

export const filmerDailyCounters = pgTable(
  "filmer_daily_counters",
  {
    counterKey: varchar("counter_key", { length: 128 }).notNull(),
    day: varchar("day", { length: 10 }).notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    counterKeyDayIdx: uniqueIndex("unique_filmer_counter_day").on(table.counterKey, table.day),
  })
);

// Checkin nonces — replaces Firestore checkin_nonces collection
export const checkinNonces = pgTable(
  "checkin_nonces",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    nonce: varchar("nonce", { length: 255 }).notNull(),
    actionHash: varchar("action_hash", { length: 64 }).notNull(),
    spotId: integer("spot_id").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    clientTimestamp: varchar("client_timestamp", { length: 50 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    expiresIdx: index("IDX_checkin_nonces_expires").on(table.expiresAt),
    userNonceIdx: uniqueIndex("unique_checkin_nonce").on(table.userId, table.nonce),
  })
);

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
  thumbnailUrl: true,
  createdBy: true,
});

export type Spot = typeof spots.$inferSelect;
export type InsertSpot = z.infer<typeof insertSpotSchema>;
export type CheckIn = typeof checkIns.$inferSelect;
export type InsertCheckIn = typeof checkIns.$inferInsert;
export type FilmerRequest = typeof filmerRequests.$inferSelect;
export type InsertFilmerRequest = typeof filmerRequests.$inferInsert;
export type FilmerDailyCounter = typeof filmerDailyCounters.$inferSelect;
