import { z } from "zod";

export const NewSubscriberInput = z.object({
  firstName: z
    .string()
    .optional()
    .transform((v) => v?.trim() || null),
  email: z
    .string()
    .email()
    .transform((v) => v.trim().toLowerCase()),
  isActive: z.boolean().optional(), // default true in service/repo
});
export type NewSubscriberInput = z.infer<typeof NewSubscriberInput>;

export const SubscriberSchema = NewSubscriberInput.extend({
  id: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
});
export type SubscriberData = z.infer<typeof SubscriberSchema>;

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9]+$/, "Username can only contain letters and numbers");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password too long")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number"
  );

export const paymentAmountSchema = z
  .number()
  .min(0.5, "Amount must be at least $0.50")
  .max(10000, "Amount cannot exceed $10,000");

export const sanitizedStringSchema = z
  .string()
  .trim()
  .max(1000, "String too long")
  // CodeQL: Bad HTML filtering regex / polynomial regex on uncontrolled data
  .refine((str) => !str.includes("<") && !str.includes(">"), "HTML is not allowed");

import {
  pgEnum,
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  json,
  varchar,
  uuid,
  index,
  doublePrecision,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  })
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  currentTutorialStep: integer("current_tutorial_step").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tutorialSteps = pgTable("tutorial_steps", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // 'intro', 'interactive', 'video', 'challenge'
  content: json("content").$type<{
    videoUrl?: string;
    interactiveElements?: Array<{
      type: "tap" | "swipe" | "drag";
      target: string;
      instruction: string;
    }>;
    challengeData?: {
      action: string;
      expectedResult: string;
    };
  }>(),
  order: integer("order").notNull(),
  isActive: boolean("is_active").default(true),
});

export const userProgress = pgTable("user_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  stepId: integer("step_id").notNull(),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  timeSpent: integer("time_spent"), // in seconds
  interactionData: json("interaction_data").$type<{
    taps?: number;
    swipes?: number;
    mistakes?: number;
    helpUsed?: boolean;
  }>(),
});

export const subscribers = pgTable("subscribers", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  firstName: text("first_name"),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  isActive: boolean("is_active").default(true),
});

export const donations = pgTable("donations", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  firstName: varchar("first_name", { length: 50 }).notNull(),
  amount: integer("amount").notNull(), // amount in cents
  paymentIntentId: varchar("payment_intent_id", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Custom authentication tables
export const customUsers = pgTable("custom_users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  firebaseUid: varchar("firebase_uid", { length: 128 }).unique(),
  pushToken: varchar("push_token", { length: 255 }), // Expo push token for notifications
  isEmailVerified: boolean("is_email_verified").default(false),
  emailVerificationToken: varchar("email_verification_token", { length: 255 }),
  emailVerificationExpires: timestamp("email_verification_expires"),
  resetPasswordToken: varchar("reset_password_token", { length: 255 }),
  resetPasswordExpires: timestamp("reset_password_expires"),
  isActive: boolean("is_active").default(true),
  trustLevel: integer("trust_level").default(0).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usernames = pgTable(
  "usernames",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    uid: varchar("uid", { length: 128 }).notNull().unique(),
    username: varchar("username", { length: 20 }).notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    usernameIdx: uniqueIndex("usernames_username_unique").on(table.username),
    uidIdx: uniqueIndex("usernames_uid_unique").on(table.uid),
  })
);

export const authSessions = pgTable("auth_sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => customUsers.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Security audit logs for compliance and threat detection
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    userId: varchar("user_id", { length: 255 }),
    email: varchar("email", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 45 }).notNull(), // IPv6 can be up to 45 chars
    userAgent: text("user_agent"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    success: boolean("success").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    eventTypeIdx: index("IDX_audit_event_type").on(table.eventType),
    userIdIdx: index("IDX_audit_user_id").on(table.userId),
    ipIdx: index("IDX_audit_ip").on(table.ipAddress),
    createdAtIdx: index("IDX_audit_created_at").on(table.createdAt),
  })
);

// Login attempts tracking for account lockout
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }).notNull(),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("IDX_login_attempts_email").on(table.email),
    ipIdx: index("IDX_login_attempts_ip").on(table.ipAddress),
    createdAtIdx: index("IDX_login_attempts_created_at").on(table.createdAt),
  })
);

// Account lockout tracking
export const accountLockouts = pgTable("account_lockouts", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  lockedAt: timestamp("locked_at").notNull(),
  unlockAt: timestamp("unlock_at").notNull(),
  failedAttempts: integer("failed_attempts").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// MFA secrets for TOTP authentication
export const mfaSecrets = pgTable("mfa_secrets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => customUsers.id, { onDelete: "cascade" })
    .unique(),
  secret: varchar("secret", { length: 255 }).notNull(), // Encrypted TOTP secret
  backupCodes: json("backup_codes").$type<string[]>(), // Hashed backup codes
  enabled: boolean("enabled").default(false).notNull(),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  userEmail: varchar("user_email", { length: 255 }),
  type: varchar("type", { length: 50 }).notNull(), // 'bug', 'feature', 'improvement', 'general'
  message: text("message").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("new"), // 'new', 'reviewed', 'resolved'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shop products table
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  productId: varchar("product_id", { length: 100 }).notNull().unique(), // e.g., 'skatehubba-tee'
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(), // price in cents
  imageUrl: varchar("image_url", { length: 500 }),
  icon: varchar("icon", { length: 50 }), // icon name from lucide-react
  category: varchar("category", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shop orders table
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  userEmail: varchar("user_email", { length: 255 }),
  items: json("items")
    .$type<
      Array<{
        id: string;
        name: string;
        price: number;
        quantity: number;
      }>
    >()
    .notNull(),
  total: integer("total").notNull(), // total in cents
  status: varchar("status", { length: 50 }).notNull().default("pending"), // 'pending', 'completed', 'failed'
  paymentIntentId: varchar("payment_intent_id", { length: 255 }).unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

export const insertTrickMasterySchema = createInsertSchema(trickMastery).omit({
  id: true,
  updatedAt: true,
});

export type TrickMastery = typeof trickMastery.$inferSelect;
export type InsertTrickMastery = z.infer<typeof insertTrickMasterySchema>;

export const insertTutorialStepSchema = createInsertSchema(tutorialSteps).omit({
  id: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
  completedAt: true,
});

export const updateUserProgressSchema = createInsertSchema(userProgress).pick({
  completed: true,
  timeSpent: true,
  interactionData: true,
});

export const insertSubscriberSchema = createInsertSchema(subscribers).omit({
  id: true,
  createdAt: true,
});

export const insertDonationSchema = createInsertSchema(donations);

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

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

// Game status enum: pending (waiting for accept), active (in progress), completed, declined, forfeited
export const GAME_STATUSES = ["pending", "active", "completed", "declined", "forfeited"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

// S.K.A.T.E. Games table
export const games = pgTable("games", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  player1Id: varchar("player1_id", { length: 255 }).notNull(),
  player1Name: varchar("player1_name", { length: 255 }).notNull(),
  player2Id: varchar("player2_id", { length: 255 }),
  player2Name: varchar("player2_name", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // 'pending', 'active', 'completed', 'declined', 'forfeited'
  currentTurn: varchar("current_turn", { length: 255 }),
  player1Letters: varchar("player1_letters", { length: 5 }).default(""),
  player2Letters: varchar("player2_letters", { length: 5 }).default(""),
  winnerId: varchar("winner_id", { length: 255 }),
  lastTrickDescription: text("last_trick_description"),
  lastTrickBy: varchar("last_trick_by", { length: 255 }),
  deadlineAt: timestamp("deadline_at"), // 24-hour deadline for current turn
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Turn result enum
export const TURN_RESULTS = ["landed", "missed", "pending"] as const;
export type TurnResult = (typeof TURN_RESULTS)[number];

// Game turns/history table
export const gameTurns = pgTable("game_turns", {
  id: serial("id").primaryKey(),
  gameId: varchar("game_id", { length: 255 }).notNull(),
  playerId: varchar("player_id", { length: 255 }).notNull(),
  playerName: varchar("player_name", { length: 255 }).notNull(),
  turnNumber: integer("turn_number").notNull(),
  trickDescription: text("trick_description").notNull(),
  videoUrl: varchar("video_url", { length: 500 }), // Firebase Storage URL
  result: varchar("result", { length: 50 }).notNull().default("pending"), // 'landed', 'missed', 'pending'
  judgedBy: varchar("judged_by", { length: 255 }), // Player ID who judged this turn
  judgedAt: timestamp("judged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertGameTurnSchema = createInsertSchema(gameTurns).omit({
  id: true,
  createdAt: true,
});

// Auth validation schemas
export const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: passwordSchema,
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const insertUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
});

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type TutorialStep = typeof tutorialSteps.$inferSelect;
export type InsertTutorialStep = z.infer<typeof insertTutorialStepSchema>;
export type UserProgress = typeof userProgress.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type UpdateUserProgress = z.infer<typeof updateUserProgressSchema>;
export type Subscriber = typeof subscribers.$inferSelect;
export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;
export type Donation = typeof donations.$inferSelect;
export type InsertDonation = z.infer<typeof insertDonationSchema>;

// Custom auth types
export type CustomUser = typeof customUsers.$inferSelect;
export type InsertCustomUser = typeof customUsers.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type InsertAuthSession = typeof authSessions.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Spot = typeof spots.$inferSelect;
export type InsertSpot = z.infer<typeof insertSpotSchema>;
export type CheckIn = typeof checkIns.$inferSelect;
export type InsertCheckIn = typeof checkIns.$inferInsert;
export type FilmerRequest = typeof filmerRequests.$inferSelect;
export type InsertFilmerRequest = typeof filmerRequests.$inferInsert;
export type FilmerDailyCounter = typeof filmerDailyCounters.$inferSelect;
export type Trick = typeof tricks.$inferSelect;
export type InsertTrick = typeof tricks.$inferInsert;
export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type GameTurn = typeof gameTurns.$inferSelect;
export type InsertGameTurn = z.infer<typeof insertGameTurnSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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

// Battles table - 1v1 trick battles
export const battles = pgTable("battles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id", { length: 255 }).notNull(),
  opponentId: varchar("opponent_id", { length: 255 }),
  matchmaking: varchar("matchmaking", { length: 20 }).notNull().default("open"), // 'open' | 'direct'
  status: varchar("status", { length: 20 }).notNull().default("waiting"), // 'waiting' | 'active' | 'voting' | 'completed'
  winnerId: varchar("winner_id", { length: 255 }),
  clipUrl: varchar("clip_url", { length: 500 }),
  responseClipUrl: varchar("response_clip_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Battle votes table
export const battleVotes = pgTable(
  "battle_votes",
  {
    id: serial("id").primaryKey(),
    battleId: varchar("battle_id", { length: 255 })
      .notNull()
      .references(() => battles.id, { onDelete: "cascade" }),
    odv: varchar("odv", { length: 255 }).notNull(), // voter ID
    vote: varchar("vote", { length: 20 }).notNull(), // 'clean' | 'sketch' | 'redo'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    battleVoterIdx: uniqueIndex("unique_battle_voter").on(table.battleId, table.odv),
  })
);

// Challenges table - SKATE game challenge requests
export const challenges = pgTable("challenges", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  challengerId: varchar("challenger_id", { length: 255 }).notNull(),
  challengedId: varchar("challenged_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  gameId: varchar("game_id", { length: 255 }),
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

export const insertChallengeSchema = createInsertSchema(challenges).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type ClosetItem = typeof closetItems.$inferSelect;
export type InsertClosetItem = z.infer<typeof insertClosetItemSchema>;
export type Challenge = typeof challenges.$inferSelect;
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;

// Battle types
export const insertBattleSchema = createInsertSchema(battles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertBattleVoteSchema = createInsertSchema(battleVotes).omit({
  id: true,
  createdAt: true,
});

export type Battle = typeof battles.$inferSelect;
export type InsertBattle = z.infer<typeof insertBattleSchema>;
export type BattleVote = typeof battleVotes.$inferSelect;
export type InsertBattleVote = z.infer<typeof insertBattleVoteSchema>;
