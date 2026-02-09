import { getIdTokenResult, type User as FirebaseUser } from "firebase/auth";
import { apiRequest } from "../lib/api/client";
import { isApiError } from "../lib/api/errors";
import { logger } from "../lib/logger";
import type { UserProfile, UserRole } from "./authStore.types";
import { transformProfile } from "./authStore.utils";

export const fetchProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const res = await apiRequest<{ profile: Record<string, unknown> }>({
      method: "GET",
      path: "/api/profile/me",
    });
    return transformProfile(uid, res.profile);
  } catch (err) {
    // 404 = no profile yet (new user), not an error worth logging
    if (isApiError(err) && err.status === 404) {
      return null;
    }
    logger.error("[AuthStore] Failed to fetch profile:", err);
    return null;
  }
};

export const extractRolesFromToken = async (firebaseUser: FirebaseUser): Promise<UserRole[]> => {
  try {
    const tokenResult = await getIdTokenResult(firebaseUser);
    return (tokenResult.claims.roles as UserRole[]) || [];
  } catch (err) {
    logger.error("[AuthStore] Failed to extract roles:", err);
    return [];
  }
};

/**
 * Authenticate a Firebase user with the backend server.
 * Creates a database user record (custom_users) and sets up the session cookie.
 * This is essential for all authenticated API calls that use the authenticateUser middleware.
 *
 * Must be called after every successful Firebase auth (login, signup, Google OAuth).
 */
export async function authenticateWithBackend(
  firebaseUser: FirebaseUser,
  options?: { firstName?: string; lastName?: string; isRegistration?: boolean }
): Promise<void> {
  try {
    const idToken = await firebaseUser.getIdToken();
    const displayName = firebaseUser.displayName || "";
    const [defaultFirst, ...lastParts] = displayName.split(" ");

    await apiRequest({
      method: "POST",
      path: "/api/auth/login",
      body: {
        firstName: options?.firstName || defaultFirst || "Skater",
        lastName: options?.lastName || lastParts.join(" ") || "",
        isRegistration: options?.isRegistration || false,
      },
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    logger.log("[AuthStore] Backend session created successfully");
  } catch (error) {
    logger.error("[AuthStore] Backend authentication failed:", error);
    // Don't throw - allow degraded mode where Firebase token auth fallback works
  }
}
