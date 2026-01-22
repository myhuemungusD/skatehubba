import { eq } from "drizzle-orm";
import { usernames } from "@shared/schema";
import type { Database } from "../db";

export interface UsernameStore {
  reserve: (uid: string, username: string) => Promise<boolean>;
  release: (uid: string) => Promise<void>;
  isAvailable: (username: string) => Promise<boolean>;
  ensure: (uid: string, username: string) => Promise<boolean>;
}

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

export interface ProfileRollbackDependencies<TProfile> {
  uid: string;
  usernameStore: UsernameStore;
  writeProfile: () => Promise<TProfile>;
}

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
