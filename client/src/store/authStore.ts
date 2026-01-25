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

export type BootStatus = "ok" | "degraded";
export type BootPhase = "starting" | "auth_ready" | "hydrating" | "finalized";

type Result<T> =
  | { status: "ok"; data: T }
  | { status: "error"; error: string }
  | { status: "timeout"; error: string };

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
  bootStatus: BootStatus;
  bootPhase: BootPhase;
  bootDurationMs: number;
  isInitialized: boolean;
  error: Error | null;

  initialize: () => Promise<void>;
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

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<Result<T>> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<Result<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ status: "timeout", error: `${label} exceeded ${ms}ms` });
    }, ms);
  });

  try {
    const data = await Promise.race([
      promise.then((res): Result<T> => ({ status: "ok", data: res })),
      timeoutPromise,
    ]);
    return data;
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeoutId!);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  profileStatus: "unknown",
  roles: [],
  bootStatus: "ok",
  bootPhase: "starting",
  bootDurationMs: 0,
  loading: true,
  isInitialized: false,
  error: null,

  initialize: async () => {
    const startTime = Date.now();
    const BOOT_TIMEOUT_MS = 10000;
    let finalStatus: BootStatus = "ok";

    set({ loading: true });

    try {
      // PHASE 1: Auth (10s Cap)
      set({ bootPhase: "auth_ready" });

      const authPromise = new Promise<FirebaseUser | null>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          unsubscribe();
          resolve(user);
        });
      });

      const authResult = await withTimeout(authPromise, BOOT_TIMEOUT_MS, "auth_check");
      let currentUser = authResult.status === "ok" ? authResult.data : null;

      // Guest Mode Fallback
      if (!currentUser && GUEST_MODE) {
        const anonResult = await withTimeout(firebaseSignInAnonymously(auth), 5000, "anon_signin");
        if (anonResult.status === "ok") {
          currentUser = anonResult.data.user;
        } else {
          finalStatus = "degraded";
        }
      }

      // PHASE 2: Data (Parallel, 4s Cap)
      if (currentUser) {
        set({ bootPhase: "hydrating", user: currentUser, profile: null, profileStatus: "unknown" });

        // In Guest Mode, we also want to ensure a profile exists, but we won't block strictly on it
        const promises: Promise<any>[] = [
          withTimeout(fetchProfile(currentUser.uid), 4000, "fetchProfile"),
          withTimeout(extractRolesFromToken(currentUser), 4000, "fetchRoles"),
        ];

        if (GUEST_MODE) {
          promises.push(withTimeout(ensureProfile(currentUser.uid), 4000, "ensureProfile"));
        }

        const results = await Promise.allSettled(promises);

        const profileRes = results[0] as PromiseSettledResult<Result<UserProfile | null>>;
        const rolesRes = results[1] as PromiseSettledResult<Result<UserRole[]>>;

        // Handle Profile Result
        if (profileRes.status === "fulfilled" && profileRes.value.status === "ok") {
          const userProfile = profileRes.value.data;
          if (userProfile) {
            set({ profile: userProfile, profileStatus: "exists" });
            writeProfileCache(currentUser.uid, { status: "exists", profile: userProfile });
          } else {
            set({ profile: null, profileStatus: "missing" });
            writeProfileCache(currentUser.uid, { status: "missing", profile: null });
          }
        } else {
          // Fallback to cache if fetch failed
          const cached = readProfileCache(currentUser.uid);
          if (cached) {
            set({ profile: cached.profile, profileStatus: cached.status });
          } else {
            finalStatus = "degraded";
          }
        }

        // Handle Roles Result
        if (rolesRes.status === "fulfilled" && rolesRes.value.status === "ok") {
          set({ roles: rolesRes.value.data, error: null });
        }
      } else {
        set({
          user: null,
          profile: null,
          profileStatus: "unknown",
          roles: [],
        });
      }
    } catch (fatal) {
      console.error("[AuthStore] Critical boot failure:", fatal);
      finalStatus = "degraded";
      if (fatal instanceof Error) {
        set({ error: fatal });
      }
    } finally {
      set({
        loading: false,
        isInitialized: true,
        bootStatus: finalStatus,
        bootPhase: "finalized",
        bootDurationMs: Date.now() - startTime,
      });
    }
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
