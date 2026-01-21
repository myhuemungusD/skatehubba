/**
 * User Profile Service
 *
 * Firestore operations for user profiles.
 * Handles reading and updating user profile documents.
 */

import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "./config";
import { UserProfile } from "./auth.types";

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

  console.error("[ProfileService] All retries failed:", lastError);
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
    console.error("[ProfileService] Failed to update profile:", error);
    throw new Error("Failed to update user profile.");
  }
}

function transformProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    username: String(data.username ?? ""),
    stance: (data.stance as UserProfile["stance"]) ?? null,
    experienceLevel: (data.experienceLevel as UserProfile["experienceLevel"]) ?? null,
    favoriteTricks: Array.isArray(data.favoriteTricks) ? (data.favoriteTricks as string[]) : [],
    bio: (data.bio as string | null) ?? null,
    sponsorFlow: (data.sponsorFlow as string | null) ?? null,
    sponsorTeam: (data.sponsorTeam as string | null) ?? null,
    hometownShop: (data.hometownShop as string | null) ?? null,
    spotsVisited: typeof data.spotsVisited === "number" ? data.spotsVisited : 0,
    crewName: (data.crewName as string | null) ?? null,
    credibilityScore: typeof data.credibilityScore === "number" ? data.credibilityScore : 0,
    avatarUrl: (data.avatarUrl as string | null) ?? null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as Timestamp).toDate();
  }
  return new Date();
}
