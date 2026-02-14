/**
 * Profile Service
 *
 * Manages username reservation and profile creation with atomic operations
 * to prevent race conditions during onboarding.
 *
 * Features:
 * - Atomic username reservation using database constraints
 * - Username availability checking
 * - Profile creation with automatic rollback on failure
 *
 * @module services/profileService
 */

import { eq } from "drizzle-orm";
import { usernames } from "@shared/schema";
import type { Database } from "../db";

/**
 * Username reservation and management interface
 *
 * Provides race-condition-safe operations for username management during
 * user onboarding. Uses database constraints (unique username + onConflictDoNothing)
 * to ensure atomic reservations.
 */
export interface UsernameStore {
  /**
   * Atomically reserve a username for a user
   *
   * Uses INSERT ... ON CONFLICT DO NOTHING to ensure only one user can reserve
   * a given username. Safe for concurrent requests.
   *
   * @param uid - User ID reserving the username
   * @param username - Username to reserve
   * @returns true if reservation succeeded, false if username was already taken
   */
  reserve: (uid: string, username: string) => Promise<boolean>;

  /**
   * Release a username reservation
   *
   * Typically called during rollback when profile creation fails after username
   * reservation. Allows the username to be reserved by another user.
   *
   * @param uid - User ID whose username reservation should be released
   */
  release: (uid: string) => Promise<void>;

  /**
   * Check if a username is available
   *
   * @param username - Username to check
   * @returns true if username is available, false if already taken
   */
  isAvailable: (username: string) => Promise<boolean>;

  /**
   * Ensure a username is reserved for a user (idempotent)
   *
   * If user already has this username reserved, returns true.
   * If username is available, reserves it and returns true.
   * If username is taken by another user, returns false.
   *
   * @param uid - User ID
   * @param username - Username to ensure
   * @returns true if username is reserved for this user, false otherwise
   */
  ensure: (uid: string, username: string) => Promise<boolean>;
}

/**
 * Create a username store instance
 *
 * Factory function that creates a UsernameStore bound to a specific database connection.
 * All operations use the provided database instance for queries.
 *
 * @param db - Database instance (Drizzle ORM)
 * @returns UsernameStore instance with bound database operations
 *
 * @example
 * ```typescript
 * const db = getDb();
 * const usernameStore = createUsernameStore(db);
 *
 * // Check availability
 * const available = await usernameStore.isAvailable('skater42');
 *
 * // Reserve username
 * const reserved = await usernameStore.reserve('user_123', 'skater42');
 * if (!reserved) {
 *   return res.status(409).json({ error: 'Username taken' });
 * }
 * ```
 */
export function createUsernameStore(db: Database): UsernameStore {
  return {
    reserve: async (uid, username) => {
      const reserved = await db.transaction(async (tx) => {
        return await tx
          .insert(usernames)
          .values({ uid, username })
          .onConflictDoNothing()
          .returning({ username: usernames.username });
      });

      return reserved.length > 0;
    },
    release: async (uid) => {
      await db.delete(usernames).where(eq(usernames.uid, uid));
    },
    isAvailable: async (username) => {
      const existing = await db
        .select({ username: usernames.username })
        .from(usernames)
        .where(eq(usernames.username, username))
        .limit(1);
      return existing.length === 0;
    },
    ensure: async (uid, username) => {
      const existingByUid = await db
        .select({ username: usernames.username })
        .from(usernames)
        .where(eq(usernames.uid, uid))
        .limit(1);

      if (existingByUid.length > 0) {
        return existingByUid[0].username === username;
      }

      const reserved = await db
        .insert(usernames)
        .values({ uid, username })
        .onConflictDoNothing()
        .returning({ username: usernames.username });

      if (reserved.length > 0) {
        return true;
      }

      const existingByUsername = await db
        .select({ uid: usernames.uid })
        .from(usernames)
        .where(eq(usernames.username, username))
        .limit(1);

      return existingByUsername.length > 0 && existingByUsername[0].uid === uid;
    },
  };
}

/**
 * Dependencies for profile creation with rollback support
 */
export interface ProfileRollbackDependencies<TProfile> {
  /** User ID creating the profile */
  uid: string;
  /** Username store for releasing reservations on failure */
  usernameStore: UsernameStore;
  /** Function that writes the profile to the database */
  writeProfile: () => Promise<TProfile>;
}

/**
 * Create a profile with automatic username rollback on failure
 *
 * Wraps profile creation logic to ensure username reservations are released
 * if profile creation fails for any reason (database error, validation, etc.).
 *
 * This prevents orphaned username reservations that would permanently block
 * usernames from being used.
 *
 * @param deps - Profile creation dependencies
 * @returns Created profile
 * @throws Re-throws any error from writeProfile after cleaning up username reservation
 *
 * @example
 * ```typescript
 * const profile = await createProfileWithRollback({
 *   uid: 'user_123',
 *   usernameStore,
 *   writeProfile: async () => {
 *     const [profile] = await db
 *       .insert(onboardingProfiles)
 *       .values({
 *         uid: 'user_123',
 *         username: 'skater42',
 *         avatarUrl: '...'
 *       })
 *       .returning();
 *     return profile;
 *   }
 * });
 * ```
 */
export async function createProfileWithRollback<TProfile>({
  uid,
  usernameStore,
  writeProfile,
}: ProfileRollbackDependencies<TProfile>): Promise<TProfile> {
  try {
    return await writeProfile();
  } catch (error) {
    await usernameStore.release(uid);
    throw error;
  }
}
