/**
 * User Service - Database abstraction layer for user operations
 * 
 * Single source of truth for user data: PostgreSQL customUsers table
 * Firebase Auth is used ONLY for authentication, not profile storage
 */

import { eq } from 'drizzle-orm';
import { db, requireDb } from '../db';
import { users } from '@shared/schema';
import logger from '../logger';

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export interface CreateUserInput {
  id: string; // Firebase UID
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

export interface UpdateUserInput {
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  onboardingCompleted?: boolean;
  currentTutorialStep?: number;
}

/**
 * Create a new user record in PostgreSQL
 * Called after Firebase Auth user creation
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const database = requireDb();
  
  logger.info('Creating user in PostgreSQL', { userId: input.id, email: input.email });
  
  const [user] = await database.insert(users).values({
    id: input.id,
    email: input.email,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    profileImageUrl: input.profileImageUrl ?? null,
  }).returning();
  
  logger.info('User created successfully', { userId: user.id });
  return user;
}

/**
 * Get user by Firebase UID
 */
export async function getUserById(userId: string): Promise<User | null> {
  if (!db) return null;
  
  const results = await db.select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  return results[0] ?? null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  if (!db) return null;
  
  const results = await db.select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  
  return results[0] ?? null;
}

/**
 * Update user profile
 */
export async function updateUser(userId: string, input: UpdateUserInput): Promise<User> {
  const database = requireDb();
  
  logger.info('Updating user profile', { userId });
  
  const [updated] = await database.update(users)
    .set(input)
    .where(eq(users.id, userId))
    .returning();
  
  if (!updated) {
    throw new Error(`User ${userId} not found`);
  }
  
  logger.info('User profile updated', { userId });
  return updated;
}

/**
 * NOTE: Role management is handled by Firebase Custom Claims, not database.
 * Use Firebase Admin SDK to set/get user roles via custom claims.
 * See scripts/set-admin.ts for example.
 */

/**
 * Delete user (removes from database)
 */
export async function deleteUser(userId: string): Promise<void> {
  const database = requireDb();
  
  logger.warn('Deleting user', { userId });
  
  await database.delete(users)
    .where(eq(users.id, userId));
  
  logger.info('User deleted', { userId });
}

/**
 * Get or create user (idempotent)
 * Useful for OAuth flows where we might not know if user exists
 */
export async function getOrCreateUser(input: CreateUserInput): Promise<User> {
  const existing = await getUserById(input.id);
  if (existing) {
    return existing;
  }

  try {
    // Attempt to create the user. This may race with another concurrent request.
    return await createUser(input);
  } catch (err) {
    // If another request inserted the same user concurrently, the database
    // should raise a unique-constraint violation. In that case, re-read.
    const code = (err as any)?.code;
    if (code === '23505') {
      const user = await getUserById(input.id);
      if (user) {
        return user;
      }
    }

    // For non-unique-violation errors, or if re-reading failed, rethrow.
    throw err;
  }
}
