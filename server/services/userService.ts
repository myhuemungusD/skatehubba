/**
 * User Service - Database abstraction layer for user operations
 *
 * Single source of truth for user account data: PostgreSQL custom_users table
 * Firebase Auth is used ONLY for authentication, not profile storage
 * Extended profile data (bio, stance, avatar) lives in user_profiles table
 *
 * NOTE: Role management is handled by Firebase Custom Claims, not database.
 * Use Firebase Admin SDK to set/get user roles via custom claims.
 * See scripts/set-admin.ts for example.
 */

import { eq } from "drizzle-orm";
import { db, requireDb } from "../db";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { customUsers, usernames } from "@shared/schema";
import logger from "../logger";

type Database = NeonDatabase<typeof import("@shared/schema")>;

export type User = typeof customUsers.$inferSelect;
export type InsertUser = typeof customUsers.$inferInsert;

export interface CreateUserInput {
  id: string; // Firebase UID
  email: string;
  passwordHash: string;
  firstName?: string | null;
  lastName?: string | null;
  firebaseUid?: string | null;
}

export interface UpdateUserInput {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  pushToken?: string | null;
}

/**
 * Create a new user record in PostgreSQL
 * Called after Firebase Auth user creation
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const database = requireDb();

  logger.info("Creating user in PostgreSQL", {
    userId: input.id,
    email: input.email,
  });

  const [user] = await database
    .insert(customUsers)
    .values({
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      firebaseUid: input.firebaseUid ?? null,
    })
    .returning();

  logger.info("User created successfully", { userId: user.id });
  return user;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  if (!db) return null;

  const results = await db.select().from(customUsers).where(eq(customUsers.id, userId)).limit(1);

  return results[0] ?? null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  if (!db) return null;

  const results = await db.select().from(customUsers).where(eq(customUsers.email, email)).limit(1);

  return results[0] ?? null;
}

/**
 * Update user account fields
 */
export async function updateUser(userId: string, input: UpdateUserInput): Promise<User> {
  const database = requireDb();

  logger.info("Updating user", { userId });

  const [updated] = await database
    .update(customUsers)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(customUsers.id, userId))
    .returning();

  if (!updated) {
    throw new Error(`User ${userId} not found`);
  }

  logger.info("User updated", { userId });
  return updated;
}

/**
 * Delete user (removes from database)
 */
export async function deleteUser(userId: string): Promise<void> {
  const database = requireDb();

  logger.warn("Deleting user", { userId });

  await database.delete(customUsers).where(eq(customUsers.id, userId));

  logger.info("User deleted", { userId });
}

/**
 * Get both display name and handle for a user in a single query path.
 * Queries usernames table first; falls back to customUsers.firstName for display name.
 */
export async function getUserNameInfo(
  database: Database,
  userId: string
): Promise<{ displayName: string; handle: string | null }> {
  const usernameResult = await database
    .select({ username: usernames.username })
    .from(usernames)
    .where(eq(usernames.uid, userId))
    .limit(1);

  if (usernameResult[0]?.username) {
    return { displayName: usernameResult[0].username, handle: usernameResult[0].username };
  }

  const userResult = await database
    .select({ firstName: customUsers.firstName })
    .from(customUsers)
    .where(eq(customUsers.id, userId))
    .limit(1);

  return { displayName: userResult[0]?.firstName || "Skater", handle: null };
}

/** Get user display name. Delegates to {@link getUserNameInfo}. */
export async function getUserDisplayName(database: Database, userId: string): Promise<string> {
  return (await getUserNameInfo(database, userId)).displayName;
}

/** Get user handle (username). Delegates to {@link getUserNameInfo}. */
export async function getUserHandle(database: Database, userId: string): Promise<string | null> {
  return (await getUserNameInfo(database, userId)).handle;
}

/**
 * Get or create user (idempotent)
 * Useful for OAuth flows where we might not know if user exists
 */
export async function getOrCreateUser(input: CreateUserInput): Promise<User> {
  const existing = await getUserById(input.id);
  if (existing) return existing;

  try {
    // Attempt to create the user. This may race with another concurrent request.
    return await createUser(input);
  } catch (err) {
    // If another request inserted the same user concurrently, the database
    // should raise a unique-constraint violation. In that case, re-read.
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      const user = await getUserById(input.id);
      if (user) return user;
    }

    // For non-unique-violation errors, or if re-reading failed, rethrow.
    throw err;
  }
}
