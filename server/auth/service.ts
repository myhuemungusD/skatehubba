import { getDb } from "../db";
import { DatabaseUnavailableError } from "../db";
import { customUsers, type CustomUser } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";

/**
 * Auth service — Firebase identity + PostgreSQL user records.
 * No JWT, no password hashing — Firebase handles identity.
 */
export class AuthService {
  /**
   * Look up a user by their Firebase UID.
   * This is the primary lookup path — Firebase handles identity,
   * we store the user record in PostgreSQL.
   *
   * Throws on database errors (instead of swallowing them as null)
   * so auth middleware can distinguish "not found" from "DB down".
   */
  static async findUserByFirebaseUid(firebaseUid: string): Promise<CustomUser | null> {
    const db = getDb(); // Throws DatabaseUnavailableError if DB not connected
    const [user] = await db
      .select()
      .from(customUsers)
      .where(eq(customUsers.firebaseUid, firebaseUid))
      .limit(1);
    return user ?? null;
  }

  static async findUserById(id: string): Promise<CustomUser | null> {
    const db = getDb();
    const [user] = await db
      .select()
      .from(customUsers)
      .where(eq(customUsers.id, id))
      .limit(1);
    return user ?? null;
  }

  static async findUserByEmail(email: string): Promise<CustomUser | null> {
    const db = getDb();
    const [user] = await db
      .select()
      .from(customUsers)
      .where(eq(customUsers.email, email.toLowerCase()))
      .limit(1);
    return user ?? null;
  }

  /**
   * Create or update a user from Firebase Auth data.
   * Called during first login — creates the PostgreSQL row if it doesn't exist.
   */
  static async upsertFromFirebase(
    firebaseUid: string,
    email: string,
    displayName?: string
  ): Promise<CustomUser> {
    const db = getDb();
    const existing = await this.findUserByFirebaseUid(firebaseUid);

    if (existing) {
      const [updated] = await db
        .update(customUsers)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(customUsers.id, existing.id))
        .returning();
      return updated;
    }

    const [firstName, ...rest] = (displayName || "Skater").split(" ");
    const lastName = rest.join(" ") || null;

    const [newUser] = await db
      .insert(customUsers)
      .values({
        email: email.toLowerCase(),
        passwordHash: "", // Firebase handles auth
        firebaseUid,
        firstName,
        lastName,
        isEmailVerified: true, // Firebase verified it
        lastLoginAt: new Date(),
      })
      .returning();

    return newUser;
  }
}
