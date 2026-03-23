import { z } from "zod";
import {
  pgTable,
  boolean,
  timestamp,
  varchar,
  uuid,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usernameSchema, passwordSchema } from "./validation";

/**
 * Core user table — one row per Firebase-authenticated user.
 * Firebase is identity-only; all user data lives here in PostgreSQL.
 */
export const customUsers = pgTable(
  "custom_users",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    firebaseUid: varchar("firebase_uid", { length: 128 }).unique(),
    isEmailVerified: boolean("is_email_verified").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    trustLevel: integer("trust_level").notNull().default(0),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    firebaseUidIdx: index("IDX_users_firebase_uid").on(table.firebaseUid),
    emailIdx: index("IDX_users_email").on(table.email),
  })
);

/**
 * Username reservation — guarantees uniqueness across the platform.
 * Decoupled from customUsers so usernames can be changed without touching auth.
 */
export const usernames = pgTable("usernames", {
  id: uuid("id").primaryKey().defaultRandom(),
  uid: varchar("uid", { length: 128 })
    .notNull()
    .unique()
    .references(() => customUsers.id, { onDelete: "cascade" }),
  username: varchar("username", { length: 20 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Validation schemas
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

// Types
export type CustomUser = typeof customUsers.$inferSelect;
export type InsertCustomUser = typeof customUsers.$inferInsert;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
