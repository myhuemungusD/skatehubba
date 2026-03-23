/**
 * Route registration — MVP
 *
 * Only three route groups: auth (login/sync), games, spots.
 */
import type { Express } from "express";
import { authenticateUser } from "./auth/middleware";
import { admin } from "./admin";
import { AuthService } from "./auth/service";
import { gamesRouter } from "./routes/games";
import { spotsRouter } from "./routes/spots";
import { getDb } from "./db";
import { userProfiles, usernames } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "./logger";

export function registerRoutes(app: Express) {
  // ============================================================================
  // Auth routes — minimal: sync Firebase user to PostgreSQL, get profile
  // ============================================================================

  /**
   * POST /api/auth/login — Sync Firebase user to PostgreSQL on first login.
   * Does NOT use authenticateUser middleware because new users won't have
   * a PG row yet. Instead, verifies the Firebase token directly and upserts.
   */
  app.post("/api/auth/login", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const token = authHeader.substring(7);
      const decoded = await admin.auth().verifyIdToken(token, true);

      const user = await AuthService.upsertFromFirebase(
        decoded.uid,
        decoded.email || "",
        decoded.name
      );

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
        },
      });
    } catch (error) {
      logger.error("[Auth] Login sync failed", { error: String(error) });
      res.status(500).json({ error: "Login failed" });
    }
  });

  /** GET /api/auth/me — Get current user + profile */
  app.get("/api/auth/me", authenticateUser, async (req, res) => {
    try {
      const db = getDb();
      const user = req.currentUser!;

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.id, user.id))
        .limit(1);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
          roles: user.roles,
        },
        profile: profile ?? null,
      });
    } catch (error) {
      logger.error("[Auth] Failed to get user", { error });
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // ============================================================================
  // Profile routes — create/update profile
  // ============================================================================

  /** POST /api/profile — Create or update profile */
  app.post("/api/profile", authenticateUser, async (req, res) => {
    const currentUserId = req.currentUser!.id;
    const { handle, displayName, bio, stance, homeSpot, photoURL } = req.body;

    if (!handle || typeof handle !== "string" || !/^[a-zA-Z0-9_]+$/.test(handle) || handle.length < 3 || handle.length > 50) {
      return res.status(400).json({ error: "Handle must be 3-50 alphanumeric characters or underscores." });
    }

    try {
      const db = getDb();
      const normalizedHandle = handle.toLowerCase();

      const profile = await db.transaction(async (tx) => {
        const [p] = await tx
          .insert(userProfiles)
          .values({
            id: currentUserId,
            handle: normalizedHandle,
            displayName: displayName || null,
            bio: bio || null,
            stance: stance || "regular",
            homeSpot: homeSpot || null,
            photoURL: photoURL || null,
          })
          .onConflictDoUpdate({
            target: userProfiles.id,
            set: {
              handle: normalizedHandle,
              displayName: displayName || null,
              bio: bio || null,
              stance: stance || "regular",
              homeSpot: homeSpot || null,
              photoURL: photoURL || null,
              updatedAt: new Date(),
            },
          })
          .returning();

        await tx
          .insert(usernames)
          .values({ uid: currentUserId, username: normalizedHandle })
          .onConflictDoUpdate({
            target: usernames.uid,
            set: { username: normalizedHandle },
          });

        return p;
      });

      res.json({ profile });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return res.status(409).json({ error: "Handle already taken." });
      }
      logger.error("[Profile] Failed to save profile", { error, userId: currentUserId });
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  /** GET /api/profile/:handle — Public profile lookup */
  app.get("/api/profile/:handle", async (req, res) => {
    try {
      const db = getDb();
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.handle, req.params.handle))
        .limit(1);

      if (!profile) return res.status(404).json({ error: "Profile not found" });
      res.json({ profile });
    } catch (error) {
      logger.error("[Profile] Lookup failed", { error });
      res.status(500).json({ error: "Profile lookup failed" });
    }
  });

  // ============================================================================
  // Game routes (authenticated)
  // ============================================================================
  app.use("/api/games", authenticateUser, gamesRouter);

  // ============================================================================
  // Spot routes (mixed auth — list is public, create requires auth)
  // ============================================================================
  app.use("/api/spots", spotsRouter);
}
