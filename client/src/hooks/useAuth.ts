import { useMemo } from "react";
import type { User } from "firebase/auth";
import { useAuthStore } from "../store/authStore";

/**
 * Determines if a Firebase user is authenticated for the application.
 * Any signed-in user (including unverified email/password) is considered authenticated.
 * Email verification is tracked separately via `isEmailVerified` and enforced
 * server-side on sensitive operations (e.g., adding spots via requireEmailVerification).
 * This allows email/password users to proceed to profile setup immediately
 * after signup while verification happens asynchronously.
 */
function isFirebaseUserAuthenticated(user: User | null): boolean {
  return user !== null;
}

/**
 * Determines if a Firebase user has verified their email.
 * - Anonymous users: always true (no email to verify)
 * - OAuth users (Google, etc.): always true (provider verified)
 * - Email/password users: true only if emailVerified flag is set
 */
function isUserEmailVerified(user: User | null): boolean {
  if (!user) return false;
  if (user.isAnonymous) return true;
  if (user.emailVerified) return true;
  return user.providerData.some((provider) => provider.providerId !== "password");
}

export function useAuth() {
  const {
    user,
    profile,
    profileStatus,
    roles,
    loading,
    isInitialized,
    error,
    signInWithGoogle,
    signInGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAnonymously,
    signInAnon,
    signOut,
    resetPassword,
    refreshRoles,
    hasRole,
    clearError,
    setProfile,
  } = useAuthStore();

  const isAuthenticated = useMemo(() => isFirebaseUserAuthenticated(user), [user]);
  const isEmailVerified = useMemo(() => isUserEmailVerified(user), [user]);
  const isAdmin = useMemo(() => roles.includes("admin"), [roles]);
  const isVerifiedPro = useMemo(() => roles.includes("verified_pro"), [roles]);
  const isModerator = useMemo(() => roles.includes("moderator"), [roles]);

  const hasProfile = profileStatus === "exists";
  const needsProfileSetup = profileStatus === "missing";

  return {
    user,
    profile,
    profileStatus,
    roles,
    loading,
    isInitialized,
    error,
    isAuthenticated,
    isEmailVerified,
    isAdmin,
    isVerifiedPro,
    isModerator,
    hasProfile,
    needsProfileSetup,
    signInWithGoogle,
    signInGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAnonymously,
    signInAnon,
    signOut,
    resetPassword,
    refreshRoles,
    hasRole,
    clearError,
    setProfile,
  };
}

export type { UserProfile, UserRole, ProfileStatus } from "../store/authStore";
