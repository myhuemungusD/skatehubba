import { Router } from "express";
import { customAlphabet } from "nanoid";
import { profileCreateSchema, usernameSchema } from "@shared/validation/profile";
import { admin } from "../admin";
import { env } from "../config/env";
import { getDb, isDatabaseAvailable } from "../db";
import { requireFirebaseUid, type FirebaseAuthedRequest } from "../middleware/firebaseUid";
import { profileCreateLimiter, usernameCheckLimiter } from "../middleware/security";
import { createProfileWithRollback, createUsernameStore } from "../services/profileService";

const router = Router();

const avatarAlphabet = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type FirestoreTimestamp = {
  toDate: () => Date;
};

interface FirestoreProfile {
  uid: string;
  username: string;
  stance: "regular" | "goofy" | null;
  experienceLevel: "beginner" | "intermediate" | "advanced" | "pro" | null;
  favoriteTricks: string[];
  bio: string | null;
  sponsorFlow?: string | null;
  sponsorTeam?: string | null;
  hometownShop?: string | null;
  spotsVisited: number;
  crewName: string | null;
  credibilityScore: number;
  avatarUrl: string | null;
  createdAt: FirestoreTimestamp | Date;
  updatedAt: FirestoreTimestamp | Date;
}

interface StorageFile {
  delete: (options: { ignoreNotFound: boolean }) => Promise<unknown>;
}

const toDate = (value: FirestoreTimestamp | Date | null | undefined): Date => {
  if (!value) {
    return new Date();
  }
  if (value instanceof Date) {
    return value;
  }
  return value.toDate();
};

const serializeProfile = (data: FirestoreProfile) => ({
  ...data,
  createdAt: toDate(data.createdAt).toISOString(),
  updatedAt: toDate(data.updatedAt).toISOString(),
});

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

router.get("/username-check", usernameCheckLimiter, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "database_unavailable" });
  }

  const raw = Array.isArray(req.query.username) ? req.query.username[0] : req.query.username;
  const parsed = usernameSchema.safeParse(raw);

  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_username" });
  }

  const db = getDb();
  const usernameStore = createUsernameStore(db);
  const available = await usernameStore.isAvailable(parsed.data);

  return res.json({ available });
});

router.post("/create", requireFirebaseUid, profileCreateLimiter, async (req, res) => {
  const { firebaseUid } = req as FirebaseAuthedRequest;
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "database_unavailable" });
  }

  const parsed = profileCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_payload",
      issues: parsed.error.flatten(),
    });
  }

  const uid = firebaseUid;
  const db = getDb();
  const usernameStore = createUsernameStore(db);
  const firestore = admin.firestore();
  const profileRef = firestore.collection("profiles").doc(uid);
  const existingProfile = await profileRef.get();
  if (existingProfile.exists) {
    const existing = existingProfile.data() as FirestoreProfile;
    if (existing.username) {
      const ensured = await usernameStore.ensure(uid, existing.username);
      if (!ensured) {
        return res.status(409).json({ error: "username_taken" });
      }
    }
    return res.status(200).json({
      profile: serializeProfile(existing),
    });
  }

  const shouldSkip = parsed.data.skip === true;
  const requestedUsername = parsed.data.username;
  if (!requestedUsername && !shouldSkip) {
    return res.status(400).json({ error: "username_required" });
  }

  let reservedUsername = requestedUsername ?? "";
  let reserved = false;

  if (shouldSkip) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
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
    return res.status(409).json({ error: "username_taken" });
  }

  let avatarUrl: string | null = null;
  let uploadedFile: StorageFile | null = null;

  try {
    if (typeof req.body.avatarBase64 === "string" && req.body.avatarBase64.length > 0) {
      const parsedAvatar = parseAvatarDataUrl(req.body.avatarBase64);
      if (!parsedAvatar) {
        await usernameStore.release(uid);
        return res.status(400).json({ error: "invalid_avatar_format" });
      }

      if (!allowedMimeTypes.has(parsedAvatar.contentType)) {
        await usernameStore.release(uid);
        return res.status(400).json({ error: "invalid_avatar_type" });
      }

      if (parsedAvatar.buffer.byteLength > MAX_AVATAR_BYTES) {
        await usernameStore.release(uid);
        return res.status(413).json({ error: "avatar_too_large" });
      }

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

    const profileData: FirestoreProfile = {
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
      createdAt: admin.firestore.FieldValue.serverTimestamp() as unknown as FirestoreTimestamp,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() as unknown as FirestoreTimestamp,
    };

    const createdProfile = await createProfileWithRollback({
      uid,
      usernameStore,
      writeProfile: async () => {
        await profileRef.create(profileData);
        return serializeProfile({
          ...profileData,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      },
    });

    return res.status(201).json({ profile: createdProfile });
  } catch (error) {
    if (uploadedFile) {
      await uploadedFile.delete({ ignoreNotFound: true });
    }
    await usernameStore.release(uid);
    return res.status(500).json({ error: "profile_create_failed" });
  }
});

export { router as profileRouter };
