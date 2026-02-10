import { z } from "zod";
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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usernameSchema, passwordSchema } from "./validation";

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

// Custom authentication tables
export const accountTierEnum = pgEnum("account_tier", ["free", "pro", "premium"]);

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
  accountTier: accountTierEnum("account_tier").default("free").notNull(),
  proAwardedBy: varchar("pro_awarded_by", { length: 255 }),
  premiumPurchasedAt: timestamp("premium_purchased_at"),
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

export const ACCOUNT_TIERS = ["free", "pro", "premium"] as const;
export type AccountTier = (typeof ACCOUNT_TIERS)[number];

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type CustomUser = typeof customUsers.$inferSelect;
export type InsertCustomUser = typeof customUsers.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type InsertAuthSession = typeof authSessions.$inferInsert;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
