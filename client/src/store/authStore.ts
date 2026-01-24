import { create } from "zustand";
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
import { GUEST_MODE } from "../config/flags";
import { ensureProfile } from "../lib/profile/ensureProfile";

export type UserRole = "admin" | "moderator" | "verified_pro";
export type ProfileStatus = "unknown" | "exists" | "missing";

export interface UserProfile {
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
  createdAt: Date;
  updatedAt: Date;
}

interface ProfileCache {
  status: ProfileStatus;
  profile: UserProfile | null;
}

interface AuthState {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  profileStatus: ProfileStatus;
  roles: UserRole[];
  loading: boolean;
  isInitialized: boolean;
  error: Error | null;

  initialize: () => () => void;
  handleRedirectResult: () => Promise<void>;

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

const transformProfile = (uid: string, data: Record<string, unknown>): UserProfile => {
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
    createdAt:
      data.createdAt && typeof data.createdAt === "object" && "toDate" in data.createdAt
        ? (data.createdAt as { toDate: () => Date }).toDate()
        : new Date(),
    updatedAt:
      data.updatedAt && typeof data.updatedAt === "object" && "toDate" in data.updatedAt
        ? (data.updatedAt as { toDate: () => Date }).toDate()
        : new Date(),
  };
};

const fetchProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const docRef = doc(db, "profiles", uid);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return transformProfile(uid, snapshot.data());
    }
    return null;
  } catch (err) {
    console.error("[AuthStore] Failed to fetch profile:", err);
    return null;
  }
};

const extractRolesFromToken = async (firebaseUser: FirebaseUser): Promise<UserRole[]> => {
  try {
    const tokenResult = await getIdTokenResult(firebaseUser);
    return (tokenResult.claims.roles as UserRole[]) || [];
  } catch (err) {
    console.error("[AuthStore] Failed to extract roles:", err);
    return [];
  }
};

let authUnsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  profileStatus: "unknown",
  roles: [],
  loading: true,
  isInitialized: false,
  error: null,

  initialize: () => {
    if (authUnsubscribe) return authUnsubscribe;

    set({ loading: true });

    authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        // Guest Mode: auto sign in anonymously if no user
        if (!firebaseUser && GUEST_MODE) {
          try {
            const cred = await firebaseSignInAnonymously(auth);
            firebaseUser = cred.user;
          } catch {
            set({ user: null, loading: false, isInitialized: true });
            return;
          }
        }

        if (firebaseUser) {
          set({
            user: firebaseUser,
            profile: null,
            profileStatus: "unknown",
          });

          // Ensure minimal profile in guest mode
          if (GUEST_MODE) {
            await ensureProfile(firebaseUser.uid);
          }

          const cachedProfile = readProfileCache(firebaseUser.uid);

          const [userProfile, userRoles] = await Promise.all([
            cachedProfile ? Promise.resolve(cachedProfile.profile) : fetchProfile(firebaseUser.uid),
            extractRolesFromToken(firebaseUser),
          ]);

          if (cachedProfile) {
            set({
              profile: cachedProfile.profile,
              profileStatus: cachedProfile.status,
            });
          } else if (userProfile) {
            set({
              profile: userProfile,
              profileStatus: "exists",
            });
            writeProfileCache(firebaseUser.uid, { status: "exists", profile: userProfile });
          } else {
            set({
              profile: null,
              profileStatus: "missing",
            });
            writeProfileCache(firebaseUser.uid, { status: "missing", profile: null });
          }

          set({ roles: userRoles, error: null });
        } else {
          set({
            user: null,
            profile: null,
            profileStatus: "unknown",
            roles: [],
          });
        }
      } catch (err) {
        console.error("[AuthStore] Auth state change error:", err);
        if (err instanceof Error) {
          set({ error: err });
        }
        set({ user: firebaseUser });
      } finally {
        set({ loading: false, isInitialized: true });
      }
    });

    return authUnsubscribe;
  },

  handleRedirectResult: async () => {
    try {
      const result = await getRedirectResult(auth);
      if (result?.user) {
        sessionStorage.removeItem("googleRedirectPending");
      }
    } catch (err: unknown) {
      console.error("[AuthStore] Redirect result error:", err);
      sessionStorage.removeItem("googleRedirectPending");
      if (err instanceof Error) {
        set({ error: err });
      }
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "auth/account-exists-with-different-credential"
      ) {
        set({
          error: new Error(
            "An account already exists with this email using a different sign-in method"
          ),
        });
      }
    }
  },

  signInWithGoogle: async () => {
    set({ error: null });
    try {
      if (isEmbeddedBrowser()) {
        throw new Error(
          "Google Sign-In is not supported in embedded browsers. Open in Safari or Chrome."
        );
      }

      sessionStorage.setItem("googleRedirectPending", "true");
      await signInWithRedirect(auth, googleProvider);
    } catch (err: unknown) {
      console.error("[AuthStore] Google sign-in error:", err);
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
        set({ error: err });
      }
      throw err;
    }
  },

  signInGoogle: async () => get().signInWithGoogle(),

  signInWithEmail: async (email: string, password: string) => {
    set({ error: null });
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      console.error("[AuthStore] Email sign-in error:", err);
      if (err instanceof Error) {
        set({ error: err });
      }
      throw err;
    }
  },

  signUpWithEmail: async (email: string, password: string) => {
    set({ error: null });
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      console.error("[AuthStore] Email sign-up error:", err);
      if (err instanceof Error) {
        set({ error: err });
      }
      throw err;
    }
  },

  signInAnonymously: async () => {
    set({ error: null });
    try {
      await firebaseSignInAnonymously(auth);
    } catch (err: unknown) {
      console.error("[AuthStore] Anonymous sign-in error:", err);
      if (err instanceof Error) {
        set({ error: err });
      }
      throw err;
    }
  },

  signInAnon: async () => get().signInAnonymously(),

  signOut: async () => {
    set({ error: null });
    try {
      const currentUid = get().user?.uid;
      await firebaseSignOut(auth);
      set({
        user: null,
        profile: null,
        profileStatus: "unknown",
        roles: [],
      });
      if (currentUid) {
        clearProfileCache(currentUid);
      }
    } catch (err: unknown) {
      console.error("[AuthStore] Sign-out error:", err);
      if (err instanceof Error) {
        set({ error: err });
      }
      throw err;
    }
  },

  resetPassword: async (email: string) => {
    set({ error: null });
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      console.error("[AuthStore] Password reset error:", err);
      if (err instanceof Error) {
        set({ error: err });
      }
      throw err;
    }
  },

  refreshRoles: async () => {
    const user = get().user;
    if (!user) return [];

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return [];

      const tokenResult = await getIdTokenResult(currentUser, true);
      const newRoles = (tokenResult.claims.roles as UserRole[]) || [];

      set({ roles: newRoles });
      console.log("[AuthStore] Roles refreshed:", newRoles);
      return newRoles;
    } catch (err: unknown) {
      console.error("[AuthStore] Failed to refresh roles:", err);
      return get().roles;
    }
  },

  hasRole: (role: UserRole) => {
    return get().roles.includes(role);
  },

  clearError: () => set({ error: null }),

  setProfile: (profile: UserProfile) => {
    set({
      profile,
      profileStatus: "exists",
    });
    writeProfileCache(profile.uid, { status: "exists", profile });
  },
}));
