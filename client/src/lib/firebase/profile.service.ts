/**
 * User Profile Service
 *
 * Firestore operations for user profiles.
 * Handles reading and updating user profile documents.
 */

import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { UserProfile } from "./auth.types";
import { logger } from "../logger";
import { transformProfile } from "../../store/authStore.utils";

const PROFILES_COLLECTION = "profiles";

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const docRef = doc(db, PROFILES_COLLECTION, uid);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data();
      return transformProfile(uid, data);
    } catch (error) {
      lastError = error;
      if ((error as { code?: string }).code === "permission-denied" && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }
      throw error;
    }
  }

  logger.error("[ProfileService] All retries failed:", lastError);
  throw new Error("Failed to load user profile.");
}

export async function updateProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, "bio" | "crewName" | "avatarUrl">>
): Promise<void> {
  try {
    const docRef = doc(db, PROFILES_COLLECTION, uid);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logger.error("[ProfileService] Failed to update profile:", error);
    throw new Error("Failed to update user profile.");
  }
}
