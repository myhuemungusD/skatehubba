import { useMemo } from "react";
import type { User } from "firebase/auth";
import { useAuthStore } from "../store/authStore";
import { useShallow } from "zustand/react/shallow";

function isFirebaseUserAuthenticated(user: User | null): boolean {
  return user !== null;
}

/**
 * Determines if a Firebase user has verified their email.
 * - OAuth users (Google, etc.): always true (provider verified)
 * - Email/password users: true only if emailVerified flag is set
 */
function isUserEmailVerified(user: User | null): boolean {
  if (!user) return false;
  if (user.emailVerified) return true;
  return user.providerData.some((provider) => provider.providerId !== "password");
}

export function useAuth() {
  // useShallow does shallow (Object.is) comparison on each value in the
  // returned object.  State values trigger re-renders only when they change.
  // Actions are referentially stable in Zustand and never trigger re-renders.
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
    signOut,
    resetPassword,
    refreshRoles,
    hasRole,
    clearError,
    setProfile,
  } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      profile: s.profile,
      profileStatus: s.profileStatus,
      roles: s.roles,
      loading: s.loading,
      isInitialized: s.isInitialized,
      error: s.error,
      signInWithGoogle: s.signInWithGoogle,
      signInGoogle: s.signInGoogle,
      signInWithEmail: s.signInWithEmail,
      signUpWithEmail: s.signUpWithEmail,
      signOut: s.signOut,
      resetPassword: s.resetPassword,
      refreshRoles: s.refreshRoles,
      hasRole: s.hasRole,
      clearError: s.clearError,
      setProfile: s.setProfile,
    }))
  );

  // Derived state
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
    signOut,
    resetPassword,
    refreshRoles,
    hasRole,
    clearError,
    setProfile,
  };
}

export type { UserProfile, UserRole, ProfileStatus } from "../store/authStore";
