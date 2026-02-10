import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  getIdTokenResult,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, db } from "../lib/firebase/config";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { apiRequest } from "../lib/api/client";
import { logger } from "../lib/logger";

import type { AuthState, BootStatus, UserRole } from "./authStore.types";
export type { UserProfile, UserRole, ProfileStatus } from "./authStore.types";

import {
  isEmbeddedBrowser,
  isPopupSafe,
  readProfileCache,
  writeProfileCache,
  clearProfileCache,
  withTimeout,
} from "./authStore.utils";

import { fetchProfile, extractRolesFromToken, authenticateWithBackend } from "./authStore.api";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

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

      const authPromise = new Promise<import("firebase/auth").User | null>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          unsubscribe();
          resolve(user);
        });
      });

      const authResult = await withTimeout(authPromise, BOOT_TIMEOUT_MS, "auth_check");
      const currentUser = authResult.status === "ok" ? authResult.data : null;

      // PHASE 2: Data (Parallel, 4s Cap)
      if (currentUser) {
        set({ bootPhase: "hydrating", user: currentUser, profile: null, profileStatus: "unknown" });

        // Ensure backend session exists for returning users
        await withTimeout(authenticateWithBackend(currentUser), 5000, "backend_sync");

        const results = await Promise.allSettled([
          withTimeout(fetchProfile(currentUser.uid), 4000, "fetchProfile"),
          withTimeout(extractRolesFromToken(currentUser), 4000, "fetchRoles"),
        ]);

        const profileRes = results[0] as PromiseSettledResult<
          Awaited<ReturnType<typeof withTimeout<import("./authStore.types").UserProfile | null>>>
        >;
        const rolesRes = results[1] as PromiseSettledResult<
          Awaited<ReturnType<typeof withTimeout<UserRole[]>>>
        >;

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
        } else {
          let rolesError = "Failed to fetch roles";
          if (rolesRes.status === "fulfilled" && rolesRes.value.status !== "ok") {
            rolesError = rolesRes.value.error;
          } else if (rolesRes.status === "rejected") {
            rolesError =
              rolesRes.reason instanceof Error ? rolesRes.reason.message : String(rolesRes.reason);
          }
          set({ error: new Error(rolesError) });
          finalStatus = "degraded";
        }
      } else {
        set({
          user: null,
          profile: null,
          profileStatus: "unknown",
          roles: [],
        });
      }

      // PHASE 3: Persistent Auth Listener
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          set({ user, loading: false });

          await withTimeout(authenticateWithBackend(user), 5000, "backend_sync");

          const currentState = get();
          if (!currentState.profile || currentState.profileStatus === "unknown") {
            const [profileResult, rolesResult] = await Promise.all([
              withTimeout(fetchProfile(user.uid), 4000, "fetchProfile"),
              withTimeout(extractRolesFromToken(user), 4000, "fetchRoles"),
            ]);

            if (profileResult.status === "ok" && profileResult.data) {
              set({ profile: profileResult.data, profileStatus: "exists" });
              writeProfileCache(user.uid, { status: "exists", profile: profileResult.data });
            } else if (profileResult.status === "ok" && !profileResult.data) {
              set({ profile: null, profileStatus: "missing" });
              writeProfileCache(user.uid, { status: "missing", profile: null });
            } else {
              const cached = readProfileCache(user.uid);
              if (cached) {
                set({ profile: cached.profile, profileStatus: cached.status });
              }
            }

            if (rolesResult.status === "ok") {
              set({ roles: rolesResult.data });
            }
          }
        } else {
          const currentUid = get().user?.uid;
          set({
            user: null,
            profile: null,
            profileStatus: "unknown",
            roles: [],
            loading: false,
          });
          if (currentUid) {
            clearProfileCache(currentUid);
          }
        }
      });
    } catch (fatal) {
      logger.error("[AuthStore] Critical boot failure:", fatal);
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
        await authenticateWithBackend(result.user);
      }
    } catch (err: unknown) {
      logger.error("[AuthStore] Redirect result error:", err);
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
      logger.error("[AuthStore] Google sign-in error:", err);
      if (err && typeof err === "object" && "code" in err) {
        const code = (err as { code?: string }).code;
        const popupFallbackCodes = [
          "auth/operation-not-supported-in-this-environment",
          "auth/unauthorized-domain",
        ];
        if (code && popupFallbackCodes.includes(code) && isPopupSafe()) {
          const popupResult = await signInWithPopup(auth, googleProvider);
          if (popupResult.user) {
            await authenticateWithBackend(popupResult.user);
          }
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
      const result = await signInWithEmailAndPassword(auth, email, password);
      await authenticateWithBackend(result.user);
    } catch (err: unknown) {
      logger.error("[AuthStore] Email sign-in error:", err);
      if (err instanceof Error) {
        set({ error: err });
      }
      throw err;
    }
  },

  signUpWithEmail: async (email: string, password: string, name?: string) => {
    set({ error: null });
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const parts = (name ?? "").trim().split(/\s+/);
      const firstName = parts[0] || undefined;
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
      await authenticateWithBackend(result.user, { firstName, lastName, isRegistration: true });
      try {
        await setDoc(doc(db, "users", result.user.uid), {
          uid: result.user.uid,
          displayName: name?.trim() || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        logger.log("[AuthStore] Firestore user doc created for", result.user.uid);
      } catch (firestoreErr) {
        logger.error("[AuthStore] Failed to create Firestore user doc:", firestoreErr);
      }
      try {
        await sendEmailVerification(result.user);
        logger.log("[AuthStore] Verification email sent to", email);
      } catch (verifyErr) {
        logger.error("[AuthStore] Failed to send verification email:", verifyErr);
      }
    } catch (err: unknown) {
      logger.error("[AuthStore] Email sign-up error:", err);
      if (err instanceof Error) {
        set({ error: err });
      }
      throw err;
    }
  },

  signOut: async () => {
    set({ error: null });
    try {
      const currentUid = get().user?.uid;
      try {
        await apiRequest({
          method: "POST",
          path: "/api/auth/logout",
        });
      } catch {
        // Ignore backend logout errors
      }
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
      logger.error("[AuthStore] Sign-out error:", err);
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
      logger.error("[AuthStore] Password reset error:", err);
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
      logger.log("[AuthStore] Roles refreshed:", newRoles);
      return newRoles;
    } catch (err: unknown) {
      logger.error("[AuthStore] Failed to refresh roles:", err);
      return get().roles;
    }
  },

  hasRole: (role: UserRole) => {
    return get().roles.includes(role);
  },

  clearError: () => set({ error: null }),

  setProfile: (profile) => {
    set({
      profile,
      profileStatus: "exists",
    });
    writeProfileCache(profile.uid, { status: "exists", profile });
  },
}));
