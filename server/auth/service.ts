import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getDb } from "../db";
import { customUsers } from "../../packages/shared/schema/index";
import { eq } from "drizzle-orm";
import type { CustomUser } from "../../packages/shared/schema/index";
import { env } from "../config/env";
import logger from "../logger";

/**
 * Auth service — stripped to MVP essentials.
 * Password hashing, JWT generation, user lookup by Firebase UID.
 */
export class AuthService {
  private static readonly JWT_SECRET = env.JWT_SECRET;
  private static readonly SALT_ROUNDS = 12;
  private static readonly TOKEN_EXPIRY = "24h";

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateJWT(userId: string): string {
    return jwt.sign(
      { userId, type: "access", jti: crypto.randomBytes(16).toString("hex") },
      this.JWT_SECRET,
      { expiresIn: this.TOKEN_EXPIRY }
    );
  }

  /**
   * Look up a user by their Firebase UID.
   * This is the primary lookup path — Firebase handles identity,
   * we store the user record in PostgreSQL.
   */
  static async findUserByFirebaseUid(firebaseUid: string): Promise<CustomUser | null> {
    try {
      const db = getDb();
      const [user] = await db
        .select()
        .from(customUsers)
        .where(eq(customUsers.firebaseUid, firebaseUid))
        .limit(1);
      return user ?? null;
    } catch (error) {
      logger.error("Failed to find user by Firebase UID", { error: String(error) });
      return null;
    }
  }

  static async findUserById(id: string): Promise<CustomUser | null> {
    try {
      const db = getDb();
      const [user] = await db
        .select()
        .from(customUsers)
        .where(eq(customUsers.id, id))
        .limit(1);
      return user ?? null;
    } catch (error) {
      logger.error("Failed to find user by ID", { error: String(error) });
      return null;
    }
  }

  static async findUserByEmail(email: string): Promise<CustomUser | null> {
    try {
      const db = getDb();
      const [user] = await db
        .select()
        .from(customUsers)
        .where(eq(customUsers.email, email.toLowerCase()))
        .limit(1);
      return user ?? null;
    } catch (error) {
      logger.error("Failed to find user by email", { error: String(error) });
      return null;
    }
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
