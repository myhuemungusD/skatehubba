/**
 * User Service - Database abstraction layer for user operations
 * 
 * Single source of truth for user data: PostgreSQL customUsers table
 * Firebase Auth is used ONLY for authentication, not profile storage
 */

import { eq } from 'drizzle-orm';
import { db, requireDb } from '../db';
import { customUsers, type CustomUser } from '@shared/schema';
import logger from '../logger';

export interface CreateUserInput {
  id: string; // Firebase UID
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  roles?: string[];
}

export interface UpdateUserInput {
  firstName?: string | null;
  lastName?: string | null;
  bio?: string | null;
  location?: string | null;
  phoneNumber?: string | null;
  photoUrl?: string | null;
}

/**
 * Create a new user record in PostgreSQL
 * Called after Firebase Auth user creation
 */
export async function createUser(input: CreateUserInput): Promise<CustomUser> {
  const database = requireDb();
  
  logger.info('Creating user in PostgreSQL', { userId: input.id, email: input.email });
  
  const [user] = await database.insert(customUsers).values({
    id: input.id,
    email: input.email,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    phoneNumber: input.phoneNumber ?? null,
    roles: input.roles ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  
  logger.info('User created successfully', { userId: user.id });
  return user;
}

/**
 * Get user by Firebase UID
 */
export async function getUserById(userId: string): Promise<CustomUser | null> {
  if (!db) return null;
  
  const users = await db.select()
    .from(customUsers)
    .where(eq(customUsers.id, userId))
    .limit(1);
  
  return users[0] ?? null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<CustomUser | null> {
  if (!db) return null;
  
  const users = await db.select()
    .from(customUsers)
    .where(eq(customUsers.email, email))
    .limit(1);
  
  return users[0] ?? null;
}

/**
 * Update user profile
 */
export async function updateUser(userId: string, input: UpdateUserInput): Promise<CustomUser> {
  const database = requireDb();
  
  logger.info('Updating user profile', { userId });
  
  const [updated] = await database.update(customUsers)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(customUsers.id, userId))
    .returning();
  
  if (!updated) {
    throw new Error(`User ${userId} not found`);
  }
  
  logger.info('User profile updated', { userId });
  return updated;
}

/**
 * Update user roles (admin only)
 */
export async function updateUserRoles(userId: string, roles: string[]): Promise<CustomUser> {
  const database = requireDb();
  
  logger.info('Updating user roles', { userId, roles });
  
  const [updated] = await database.update(customUsers)
    .set({
      roles,
      updatedAt: new Date(),
    })
    .where(eq(customUsers.id, userId))
    .returning();
  
  if (!updated) {
    throw new Error(`User ${userId} not found`);
  }
  
  logger.info('User roles updated', { userId, roles });
  return updated;
}

/**
 * Check if user has a specific role
 */
export async function userHasRole(userId: string, role: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return false;
  
  return user.roles?.includes(role) ?? false;
}

/**
 * Check if user is admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  return userHasRole(userId, 'admin');
}

/**
 * Check if user is verified pro
 */
export async function isVerifiedPro(userId: string): Promise<boolean> {
  return userHasRole(userId, 'verified_pro');
}

/**
 * Delete user (soft delete - set inactive)
 */
export async function deleteUser(userId: string): Promise<void> {
  const database = requireDb();
  
  logger.warn('Soft deleting user', { userId });
  
  await database.update(customUsers)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(customUsers.id, userId));
  
  logger.info('User soft deleted', { userId });
}

/**
 * Get or create user (idempotent)
 * Useful for OAuth flows where we might not know if user exists
 */
export async function getOrCreateUser(input: CreateUserInput): Promise<CustomUser> {
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
