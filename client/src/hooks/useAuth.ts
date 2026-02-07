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

/**
 * Individual selectors — each returns a stable reference so the component
 * only re-renders when that specific slice changes (Zustand uses Object.is).
 * Functions defined in create() are referentially stable across renders.
 */
const selectUser = (s: ReturnType<typeof useAuthStore.getState>) => s.user;
const selectProfile = (s: ReturnType<typeof useAuthStore.getState>) => s.profile;
const selectProfileStatus = (s: ReturnType<typeof useAuthStore.getState>) => s.profileStatus;
const selectRoles = (s: ReturnType<typeof useAuthStore.getState>) => s.roles;
const selectLoading = (s: ReturnType<typeof useAuthStore.getState>) => s.loading;
const selectIsInitialized = (s: ReturnType<typeof useAuthStore.getState>) => s.isInitialized;
const selectError = (s: ReturnType<typeof useAuthStore.getState>) => s.error;

const selectSignInWithGoogle = (s: ReturnType<typeof useAuthStore.getState>) => s.signInWithGoogle;
const selectSignInGoogle = (s: ReturnType<typeof useAuthStore.getState>) => s.signInGoogle;
const selectSignInWithEmail = (s: ReturnType<typeof useAuthStore.getState>) => s.signInWithEmail;
const selectSignUpWithEmail = (s: ReturnType<typeof useAuthStore.getState>) => s.signUpWithEmail;
const selectSignInAnonymously = (s: ReturnType<typeof useAuthStore.getState>) => s.signInAnonymously;
const selectSignInAnon = (s: ReturnType<typeof useAuthStore.getState>) => s.signInAnon;
const selectSignOut = (s: ReturnType<typeof useAuthStore.getState>) => s.signOut;
const selectResetPassword = (s: ReturnType<typeof useAuthStore.getState>) => s.resetPassword;
const selectRefreshRoles = (s: ReturnType<typeof useAuthStore.getState>) => s.refreshRoles;
const selectHasRole = (s: ReturnType<typeof useAuthStore.getState>) => s.hasRole;
const selectClearError = (s: ReturnType<typeof useAuthStore.getState>) => s.clearError;
const selectSetProfile = (s: ReturnType<typeof useAuthStore.getState>) => s.setProfile;

export function useAuth() {
  // State slices — each selector triggers re-render only when its value changes
  const user = useAuthStore(selectUser);
  const profile = useAuthStore(selectProfile);
  const profileStatus = useAuthStore(selectProfileStatus);
  const roles = useAuthStore(selectRoles);
  const loading = useAuthStore(selectLoading);
  const isInitialized = useAuthStore(selectIsInitialized);
  const error = useAuthStore(selectError);

  // Actions — stable references, never cause re-renders
  const signInWithGoogle = useAuthStore(selectSignInWithGoogle);
  const signInGoogle = useAuthStore(selectSignInGoogle);
  const signInWithEmail = useAuthStore(selectSignInWithEmail);
  const signUpWithEmail = useAuthStore(selectSignUpWithEmail);
  const signInAnonymously = useAuthStore(selectSignInAnonymously);
  const signInAnon = useAuthStore(selectSignInAnon);
  const signOut = useAuthStore(selectSignOut);
  const resetPassword = useAuthStore(selectResetPassword);
  const refreshRoles = useAuthStore(selectRefreshRoles);
  const hasRole = useAuthStore(selectHasRole);
  const clearError = useAuthStore(selectClearError);
  const setProfile = useAuthStore(selectSetProfile);

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
