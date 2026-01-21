/**
 * AuthProvider - Production-Grade Authentication Context
 *
 * The single source of truth for authentication state in the application.
 * Handles Firebase Auth, user profiles, and role-based access control.
 *
 * Features:
 * - Firebase Auth integration with Google, Email, and Anonymous sign-in
 * - Profile fetching and onboarding gating
 * - Role-based access control (RBAC) with custom claims
 * - Token refresh for role updates
 * - Clean loading states with render gating
 * - Comprehensive error handling
 *
 * @example
 * ```tsx
 * // Wrap your app
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 *
 * // Use in any component
 * const { user, profile, roles, isAdmin, signInWithGoogle, signOut } = useAuth();
 * ```
 *
 * @module context/AuthProvider
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously as firebaseSignInAnonymously,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  getIdTokenResult,
  GoogleAuthProvider,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase/config";

// ============================================================================
// Types
// ============================================================================

/** Valid user roles in the system */
export type UserRole = "admin" | "moderator" | "verified_pro";

export type ProfileStatus = "unknown" | "exists" | "missing";

/** User profile stored in Firestore */
export interface UserProfile {
  uid: string;
  username: string;
  stance: "regular" | "goofy" | null;
  experienceLevel: "beginner" | "intermediate" | "advanced" | "pro" | null;
  favoriteTricks: string[];
  bio: string | null;
  spotsVisited: number;
  crewName: string | null;
  credibilityScore: number;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Auth context value available to all components */
export interface AuthContextType {
  // State
  user: FirebaseUser | null;
  profile: UserProfile | null;
  profileStatus: ProfileStatus;
  roles: UserRole[];
  loading: boolean;
  error: Error | null;

  // Computed
  isAuthenticated: boolean;
  isAdmin: boolean;
  isVerifiedPro: boolean;
  isModerator: boolean;
  hasProfile: boolean;
  needsProfileSetup: boolean;

  // Actions
  signInWithGoogle: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signInAnon: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshRoles: () => Promise<UserRole[]>;
  hasRole: (role: UserRole) => boolean;
  clearError: () => void;
  setProfile: (profile: UserProfile) => void;
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextType | null>(null);

// ============================================================================
// Hook
// ============================================================================

/**
 * Access authentication state and actions
 * Must be used within an AuthProvider
 *
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// ============================================================================
// Provider
// ============================================================================

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const isEmbeddedBrowser = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || navigator.vendor || "";
  return (
    ua.includes("FBAN") ||
    ua.includes("FBAV") ||
    ua.includes("Instagram") ||
    ua.includes("Twitter") ||
    ua.includes("Line/") ||
    ua.includes("KAKAOTALK") ||
    ua.includes("Snapchat") ||
    ua.includes("TikTok") ||
    (ua.includes("wv") && ua.includes("Android"))
  );
};

const isPopupSafe = () => {
  if (typeof window === "undefined") return false;
  return !isEmbeddedBrowser();
};

interface AuthProviderProps {
  children: ReactNode;
  /** Optional loading component */
  LoadingComponent?: React.ComponentType;
}

interface ProfileCache {
  status: ProfileStatus;
  profile: UserProfile | null;
}

const profileCacheKey = (uid: string) => `skatehubba.profile.${uid}`;

const readProfileCache = (uid: string): ProfileCache | null => {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(profileCacheKey(uid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProfileCache;
    if (parsed.profile) {
      return {
        status: parsed.status,
        profile: {
          ...parsed.profile,
          createdAt: new Date(parsed.profile.createdAt),
          updatedAt: new Date(parsed.profile.updatedAt),
        },
      };
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeProfileCache = (uid: string, cache: ProfileCache) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(profileCacheKey(uid), JSON.stringify(cache));
};

const clearProfileCache = (uid: string) => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(profileCacheKey(uid));
};

export function AuthProvider({ children, LoadingComponent }: AuthProviderProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("unknown");
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Transform Firestore data to UserProfile
   */
  const transformProfile = useCallback(
    (uid: string, data: Record<string, unknown>): UserProfile => {
      return {
        uid,
        username: String(data.username ?? ""),
        stance: (data.stance as UserProfile["stance"]) ?? null,
        experienceLevel: (data.experienceLevel as UserProfile["experienceLevel"]) ?? null,
        favoriteTricks: Array.isArray(data.favoriteTricks) ? (data.favoriteTricks as string[]) : [],
        bio: (data.bio as string | null) ?? null,
        spotsVisited: typeof data.spotsVisited === "number" ? data.spotsVisited : 0,
        crewName: (data.crewName as string | null) ?? null,
        credibilityScore: typeof data.credibilityScore === "number" ? data.credibilityScore : 0,
        avatarUrl: (data.avatarUrl as string | null) ?? null,
        createdAt:
          data.createdAt && typeof data.createdAt === "object" && "toDate" in data.createdAt
            ? (data.createdAt as { toDate: () => Date }).toDate()
            : new Date(),
        updatedAt:
          data.updatedAt && typeof data.updatedAt === "object" && "toDate" in data.updatedAt
            ? (data.updatedAt as { toDate: () => Date }).toDate()
            : new Date(),
      };
    },
    []
  );

  /**
   * Fetch user profile from Firestore
   */
  const fetchProfile = useCallback(
    async (uid: string): Promise<UserProfile | null> => {
      try {
        const docRef = doc(db, "profiles", uid);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists()) {
          return transformProfile(uid, snapshot.data());
        }
        return null;
      } catch (err) {
        console.error("[AuthProvider] Failed to fetch profile:", err);
        return null;
      }
    },
    [transformProfile]
  );

  const setProfileState = useCallback((value: UserProfile) => {
    setProfile(value);
    setProfileStatus("exists");
    writeProfileCache(value.uid, { status: "exists", profile: value });
  }, []);

  /**
   * Extract roles from Firebase token
   */
  const extractRolesFromToken = useCallback(
    async (firebaseUser: FirebaseUser): Promise<UserRole[]> => {
      try {
        const tokenResult = await getIdTokenResult(firebaseUser);
        return (tokenResult.claims.roles as UserRole[]) || [];
      } catch (err) {
        console.error("[AuthProvider] Failed to extract roles:", err);
        return [];
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Auth State Listener
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // User is signed in
          setUser(firebaseUser);
          setProfile(null);
          setProfileStatus("unknown");
          const cachedProfile = readProfileCache(firebaseUser.uid);

          // Fetch profile and roles in parallel (single read per session)
          const [userProfile, userRoles] = await Promise.all([
            cachedProfile ? Promise.resolve(cachedProfile.profile) : fetchProfile(firebaseUser.uid),
            extractRolesFromToken(firebaseUser),
          ]);

          if (cachedProfile) {
            setProfile(cachedProfile.profile);
            setProfileStatus(cachedProfile.status);
          } else if (userProfile) {
            setProfileState(userProfile);
          } else {
            setProfile(null);
            setProfileStatus("missing");
            writeProfileCache(firebaseUser.uid, { status: "missing", profile: null });
          }
          setRoles(userRoles);
          setError(null);
        } else {
          // User is signed out
          setUser(null);
          setProfile(null);
          setProfileStatus("unknown");
          setRoles([]);
        }
      } catch (err: unknown) {
        console.error("[AuthProvider] Auth state change error:", err);
        if (err instanceof Error) {
          setError(err);
        }
        // Still set the user even if profile fetch fails
        setUser(firebaseUser);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [extractRolesFromToken, fetchProfile, setProfileState]);

  // ---------------------------------------------------------------------------
  // Handle Google Redirect Result
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Handle redirect result when returning from Google OAuth on mobile
    const handleRedirectResult = async () => {
      try {
        console.log("[AuthProvider] Checking for redirect result...");
        const result = await getRedirectResult(auth);

        if (result && result.user) {
          console.log("[AuthProvider] Redirect result found, user:", result.user.uid);
          // The onAuthStateChanged listener will handle setting the user state
          // but we can clear any pending flags here
          sessionStorage.removeItem("googleRedirectPending");
        } else {
          console.log("[AuthProvider] No redirect result (normal page load)");
        }
      } catch (err: unknown) {
        console.error("[AuthProvider] Redirect result error:", err);
        sessionStorage.removeItem("googleRedirectPending");

        // Set error so UI can display it
        if (err instanceof Error) {
          setError(err);
        }

        // Handle specific redirect errors
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          err.code === "auth/account-exists-with-different-credential"
        ) {
          setError(
            new Error("An account already exists with this email using a different sign-in method")
          );
        }
      }
    };

    handleRedirectResult();
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      if (isEmbeddedBrowser()) {
        throw new Error(
          "Google Sign-In is not supported in embedded browsers. Open in Safari or Chrome."
        );
      }

      sessionStorage.setItem("googleRedirectPending", "true");
      await signInWithRedirect(auth, googleProvider);
    } catch (err: unknown) {
      console.error("[AuthProvider] Google sign-in error:", err);

      if (err && typeof err === "object" && "code" in err) {
        const code = (err as { code?: string }).code;
        const popupFallbackCodes = [
          "auth/operation-not-supported-in-this-environment",
          "auth/unauthorized-domain",
        ];
        if (code && popupFallbackCodes.includes(code) && isPopupSafe()) {
          await signInWithPopup(auth, googleProvider);
          return;
        }
      }

      if (err instanceof Error) {
        setError(err);
      }
      throw err;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<void> => {
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      console.error("[AuthProvider] Email sign-in error:", err);
      if (err instanceof Error) {
        setError(err);
      }
      throw err;
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<void> => {
    setError(null);

    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      console.error("[AuthProvider] Email sign-up error:", err);
      if (err instanceof Error) {
        setError(err);
      }
      throw err;
    }
  }, []);

  const signInAnonymously = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      await firebaseSignInAnonymously(auth);
    } catch (err: unknown) {
      console.error("[AuthProvider] Anonymous sign-in error:", err);
      if (err instanceof Error) {
        setError(err);
      }
      throw err;
    }
  }, []);

  const signInGoogle = useCallback(async () => signInWithGoogle(), [signInWithGoogle]);
  const signInAnon = useCallback(async () => signInAnonymously(), [signInAnonymously]);

  const signOut = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      const currentUid = user?.uid;
      await firebaseSignOut(auth);
      setUser(null);
      setProfile(null);
      setProfileStatus("unknown");
      setRoles([]);
      if (currentUid) {
        clearProfileCache(currentUid);
      }
    } catch (err: unknown) {
      console.error("[AuthProvider] Sign-out error:", err);
      if (err instanceof Error) {
        setError(err);
      }
      throw err;
    }
  }, [user]);

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    setError(null);

    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      console.error("[AuthProvider] Password reset error:", err);
      if (err instanceof Error) {
        setError(err);
      }
      throw err;
    }
  }, []);

  /**
   * Force refresh the user's token to get updated roles
   * Call this after an admin assigns new roles
   */
  const refreshRoles = useCallback(async (): Promise<UserRole[]> => {
    if (!user) return [];

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) return [];

      // Force refresh the token
      const tokenResult = await getIdTokenResult(currentUser, true);
      const newRoles = (tokenResult.claims.roles as UserRole[]) || [];

      setRoles(newRoles);
      console.log("[AuthProvider] Roles refreshed:", newRoles);

      return newRoles;
    } catch (err: unknown) {
      console.error("[AuthProvider] Failed to refresh roles:", err);
      return roles;
    }
  }, [user, roles]);

  const hasRole = useCallback(
    (role: UserRole): boolean => {
      return roles.includes(role);
    },
    [roles]
  );

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value = useMemo<AuthContextType>(
    () => ({
      // State
      user,
      profile,
      profileStatus,
      roles,
      loading,
      error,

      // Computed
      isAuthenticated: user !== null,
      isAdmin: roles.includes("admin"),
      isVerifiedPro: roles.includes("verified_pro"),
      isModerator: roles.includes("moderator"),
      hasProfile: profileStatus === "exists",
      needsProfileSetup: profileStatus === "missing",

      // Actions
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
      setProfile: setProfileState,
    }),
    [
      user,
      profile,
      profileStatus,
      roles,
      loading,
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
      setProfileState,
    ]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Show loading state while bootstrapping
  if (loading) {
    if (LoadingComponent) {
      return <LoadingComponent />;
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-[#181818]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading SkateHubba...</p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Exports
// ============================================================================

export default AuthProvider;
export { AuthContext };
