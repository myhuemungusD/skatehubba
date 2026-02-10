import { Router } from "express";
import { customAlphabet } from "nanoid";
import { profileCreateSchema, usernameSchema } from "@shared/validation/profile";
import { admin } from "../admin";
import { env } from "../config/env";
import { getDb, isDatabaseAvailable } from "../db";
import { onboardingProfiles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireFirebaseUid, type FirebaseAuthedRequest } from "../middleware/firebaseUid";
import { profileCreateLimiter, usernameCheckLimiter } from "../middleware/security";
import { createProfileWithRollback, createUsernameStore } from "../services/profileService";
import logger from "../logger";
import { MAX_AVATAR_BYTES, MAX_USERNAME_GENERATION_ATTEMPTS } from "../config/constants";
import { Errors } from "../utils/apiError";

const router = Router();

const avatarAlphabet = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

interface StorageFile {
  delete: (options: { ignoreNotFound: boolean }) => Promise<unknown>;
}

const parseAvatarDataUrl = (dataUrl: string): { buffer: Buffer; contentType: string } | null => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const contentType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  return { buffer, contentType };
};

const generateUsername = () => `skater${avatarAlphabet()}`;

router.get("/me", requireFirebaseUid, async (req, res) => {
  const { firebaseUid } = req as FirebaseAuthedRequest;

  if (!isDatabaseAvailable()) {
    return res.status(503).json({
      code: "database_unavailable",
      message: "Database is temporarily unavailable. Please try again.",
    });
  }

  try {
    const db = getDb();
    const [profile] = await db
      .select()
      .from(onboardingProfiles)
      .where(eq(onboardingProfiles.uid, firebaseUid))
      .limit(1);

    if (!profile) {
      return Errors.notFound(res, "PROFILE_NOT_FOUND", "Profile not found.");
    }

    return res.json({
      profile: {
        ...profile,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      },
    });
  } catch {
    return Errors.internal(res, "PROFILE_FETCH_FAILED", "Failed to load profile. Please try again.");
  }
});

router.get("/username-check", usernameCheckLimiter, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return Errors.dbUnavailable(res);
  }

  const raw = Array.isArray(req.query.username) ? req.query.username[0] : req.query.username;
  const parsed = usernameSchema.safeParse(raw);

  if (!parsed.success) {
    return Errors.badRequest(res, "invalid_username", "Username format is invalid.", { field: "username" });
  }

  try {
    const db = getDb();
    const usernameStore = createUsernameStore(db);
    const available = await usernameStore.isAvailable(parsed.data);

    return res.json({ available });
  } catch (error) {
    logger.error("Username availability check failed", { error });
    return Errors.unavailable(res, "DATABASE_UNAVAILABLE", "Could not check username availability. Please try again shortly.");
  }
});

router.post("/create", requireFirebaseUid, profileCreateLimiter, async (req, res) => {
  const { firebaseUid } = req as FirebaseAuthedRequest;
  if (!isDatabaseAvailable()) {
    return Errors.dbUnavailable(res);
  }

  const parsed = profileCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten(), "INVALID_PAYLOAD", "Invalid profile data.");
  }

  const uid = firebaseUid;
  const db = getDb();
  const usernameStore = createUsernameStore(db);

  // Check if profile already exists in PostgreSQL
  const [existingProfile] = await db
    .select()
    .from(onboardingProfiles)
    .where(eq(onboardingProfiles.uid, uid))
    .limit(1);

  if (existingProfile) {
    if (existingProfile.username) {
      const ensured = await usernameStore.ensure(uid, existingProfile.username);
      if (!ensured) {
        return Errors.conflict(res, "USERNAME_TAKEN", "That username is already taken.", { field: "username" });
      }
    }
    return res.status(200).json({
      profile: {
        ...existingProfile,
        createdAt: existingProfile.createdAt.toISOString(),
        updatedAt: existingProfile.updatedAt.toISOString(),
      },
    });
  }

  const shouldSkip = parsed.data.skip === true;
  const requestedUsername = parsed.data.username;
  if (!requestedUsername && !shouldSkip) {
    return Errors.badRequest(res, "USERNAME_REQUIRED", "Username is required unless you skip.", { field: "username" });
  }

  let reservedUsername = requestedUsername ?? "";
  let reserved = false;

  if (shouldSkip) {
    for (let attempt = 0; attempt < MAX_USERNAME_GENERATION_ATTEMPTS; attempt += 1) {
      const candidate = generateUsername();
      const ok = await usernameStore.reserve(uid, candidate);
      if (ok) {
        reservedUsername = candidate;
        reserved = true;
        break;
      }
    }
  } else if (requestedUsername) {
    reservedUsername = requestedUsername;
    reserved = await usernameStore.reserve(uid, reservedUsername);
  }

  if (!reserved) {
    return Errors.conflict(res, "USERNAME_TAKEN", "That username is already taken.", { field: "username" });
  }

  let avatarUrl: string | null = null;
  let uploadedFile: StorageFile | null = null;

  try {
    if (typeof req.body.avatarBase64 === "string" && req.body.avatarBase64.length > 0) {
      const parsedAvatar = parseAvatarDataUrl(req.body.avatarBase64);
      if (!parsedAvatar) {
        await usernameStore.release(uid);
        return Errors.badRequest(res, "INVALID_AVATAR_FORMAT", "Avatar format is invalid.", { field: "avatarBase64" });
      }

      if (!allowedMimeTypes.has(parsedAvatar.contentType)) {
        await usernameStore.release(uid);
        return Errors.badRequest(res, "INVALID_AVATAR_TYPE", "Avatar type is not supported.", { field: "avatarBase64" });
      }

      if (parsedAvatar.buffer.byteLength > MAX_AVATAR_BYTES) {
        await usernameStore.release(uid);
        return Errors.tooLarge(res, "AVATAR_TOO_LARGE", "Avatar file is too large.");
      }

      // Firebase Storage for file uploads (not a database — kept intentionally)
      const bucket = env.FIREBASE_STORAGE_BUCKET
        ? admin.storage().bucket(env.FIREBASE_STORAGE_BUCKET)
        : admin.storage().bucket();
      const filePath = `profiles/${uid}/avatar`;
      const file = bucket.file(filePath);
      await file.save(parsedAvatar.buffer, {
        resumable: false,
        metadata: {
          contentType: parsedAvatar.contentType,
          cacheControl: "public, max-age=31536000",
        },
      });
      uploadedFile = file;
      const encodedPath = encodeURIComponent(filePath);
      avatarUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
    }

    const now = new Date();

    const createdProfile = await createProfileWithRollback({
      uid,
      usernameStore,
      writeProfile: async () => {
        const [profile] = await db
          .insert(onboardingProfiles)
          .values({
            uid,
            username: reservedUsername,
            stance: parsed.data.stance ?? null,
            experienceLevel: parsed.data.experienceLevel ?? null,
            favoriteTricks: parsed.data.favoriteTricks ?? [],
            bio: parsed.data.bio ?? null,
            sponsorFlow: parsed.data.sponsorFlow ?? null,
            sponsorTeam: parsed.data.sponsorTeam ?? null,
            hometownShop: parsed.data.hometownShop ?? null,
            spotsVisited: parsed.data.spotsVisited ?? 0,
            crewName: parsed.data.crewName ?? null,
            credibilityScore: parsed.data.credibilityScore ?? 0,
            avatarUrl,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return {
          ...profile,
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
        };
      },
    });

    return res.status(201).json({ profile: createdProfile });
  } catch (error) {
    if (uploadedFile) {
      await uploadedFile.delete({ ignoreNotFound: true });
    }
    await usernameStore.release(uid);
    return Errors.internal(res, "PROFILE_CREATE_FAILED", "Failed to create profile. Please try again.");
  }
});

export { router as profileRouter };
