import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut as firebaseSignOut,
  getIdTokenResult,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, db } from "../lib/firebase/config";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { apiRequest } from "../lib/api/client";
import { logger } from "../lib/logger";
import { setSentryUser, clearSentryUser } from "../sentry";
import { isExpectedAuthError, extractFirebaseErrorCode } from "../lib/firebase/auth-errors";

import type {
  AuthState,
  BootStatus,
  ProfileStatus,
  UserRole,
  UserProfile,
} from "./authStore.types";
import { usePresenceStore } from "./usePresenceStore";
import { useChatStore } from "./useChatStore";
export type { UserProfile, UserRole, ProfileStatus } from "./authStore.types";

import {
  isEmbeddedBrowser,
  isPopupSafe,
  writeProfileCache,
  clearProfileCache,
  resolveProfileResult,
  withTimeout,
} from "./authStore.utils";

import { fetchProfile, extractRolesFromToken, authenticateWithBackend } from "./authStore.api";

// ── Timeout constants ────────────────────────────────────────────────
const PROFILE_FETCH_TIMEOUT_MS = 8000;
const ROLES_FETCH_TIMEOUT_MS = 4000;
const BACKEND_SYNC_TIMEOUT_MS = 5000;
const BOOT_TIMEOUT_MS = 10000;
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

let activeRecaptchaVerifier: InstanceType<typeof RecaptchaVerifier> | null = null;

// ── Shared helper: fetch profile + roles, resolve, and return state update ──
async function fetchProfileAndRoles(uid: string): Promise<{
  profile: UserProfile | null;
  profileStatus: ProfileStatus;
  roles: UserRole[] | null;
  degraded: boolean;
}> {
  const [profileResult, rolesResult] = await Promise.all([
    withTimeout(fetchProfile(uid), PROFILE_FETCH_TIMEOUT_MS, "fetchProfile"),
    withTimeout(extractRolesFromToken(auth.currentUser!), ROLES_FETCH_TIMEOUT_MS, "fetchRoles"),
  ]);

  const resolved = resolveProfileResult(uid, profileResult);
  // Never leave "unknown" — fall back to "missing" to unblock the AppRoutes gate
  const profileStatus: ProfileStatus =
    resolved.profileStatus === "unknown" ? "missing" : resolved.profileStatus;

  return {
    profile: resolved.profile,
    profileStatus,
    roles: rolesResult.status === "ok" ? rolesResult.data : null,
    degraded: resolved.degraded,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  profileStatus: "unknown",
  backendDisplayName: null,
  roles: [],
  bootStatus: "ok",
  bootPhase: "starting",
  bootDurationMs: 0,
  loading: true,
  isInitialized: false,
  error: null,
  phoneConfirmationResult: null,

  initialize: async () => {
    const startTime = Date.now();
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

      // PHASE 2: Data (Parallel, 8s Cap)
      if (currentUser) {
        set({ bootPhase: "hydrating", user: currentUser, profile: null, profileStatus: "unknown" });

        // Ensure backend session exists for returning users
        const backendResult = await withTimeout(
          authenticateWithBackend(currentUser),
          BACKEND_SYNC_TIMEOUT_MS,
          "backend_sync"
        );
        if (backendResult.status === "ok" && backendResult.data?.displayName) {
          set({ backendDisplayName: backendResult.data.displayName });
        }

        const results = await Promise.allSettled([
          withTimeout(fetchProfile(currentUser.uid), PROFILE_FETCH_TIMEOUT_MS, "fetchProfile"),
          withTimeout(extractRolesFromToken(currentUser), ROLES_FETCH_TIMEOUT_MS, "fetchRoles"),
        ]);

        const profileRes = results[0] as PromiseSettledResult<
          Awaited<ReturnType<typeof withTimeout<import("./authStore.types").UserProfile | null>>>
        >;
        const rolesRes = results[1] as PromiseSettledResult<
          Awaited<ReturnType<typeof withTimeout<UserRole[]>>>
        >;

        // Handle Profile Result
        {
          const profileValue =
            profileRes.status === "fulfilled"
              ? profileRes.value
              : { status: "error" as const, error: "fetch rejected" };
          const resolved = resolveProfileResult(currentUser.uid, profileValue);
          set({ profile: resolved.profile, profileStatus: resolved.profileStatus });
          if (resolved.degraded) finalStatus = "degraded";
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
          setSentryUser({ uid: user.uid, username: user.displayName || undefined });

          try {
            const backendResult = await withTimeout(
              authenticateWithBackend(user),
              BACKEND_SYNC_TIMEOUT_MS,
              "backend_sync"
            );
            if (backendResult.status === "ok" && backendResult.data?.displayName) {
              set({ backendDisplayName: backendResult.data.displayName });
            }

            // Only refetch when profile is genuinely unknown. Never overwrite
            // a confirmed "exists" or "missing" status — that causes the
            // profile-setup redirect even though the user already has a profile.
            if (get().profileStatus === "unknown") {
              const result = await fetchProfileAndRoles(user.uid);

              // Re-check: another code path (e.g. signInWithEmail) may have
              // resolved the profile while we were fetching.
              if (get().profileStatus !== "exists") {
                const update: Partial<AuthState> = {
                  profile: result.profile,
                  profileStatus: result.profileStatus,
                };
                if (result.roles) update.roles = result.roles;
                set(update);
              }
            }
          } catch (listenerErr) {
            logger.error("[AuthStore] Auth listener error:", listenerErr);
            // Ensure profileStatus isn't stuck at "unknown" after failure,
            // but never downgrade a confirmed "exists" to "missing".
            if (get().profileStatus === "unknown") {
              set({ profileStatus: "missing" });
            }
          }
        } else {
          const currentUid = get().user?.uid;
          clearSentryUser();
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

      // PHASE 4: Periodic token refresh — detect expired/revoked sessions
      // Firebase ID tokens expire after 1 hour. Proactively refresh every
      // 10 minutes so users aren't silently using an invalid token.
      setInterval(async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        try {
          await currentUser.getIdToken(true);
        } catch (refreshErr) {
          logger.error("[AuthStore] Token refresh failed, signing out:", refreshErr);
          get()
            .signOut()
            .catch(() => {});
        }
      }, TOKEN_REFRESH_INTERVAL_MS);
    } catch (fatal) {
      logger.error("[AuthStore] Critical boot failure:", fatal);
      finalStatus = "degraded";
      if (fatal instanceof Error) {
        set({ error: fatal });
      }
    } finally {
      // Guarantee profileStatus resolves to a definitive state after boot.
      // If profile fetch failed and no cache exists, profileStatus is still
      // "unknown". Falling back to "missing" unblocks the AppRoutes gate
      // (which shows an infinite loading screen when authenticated +
      // profileStatus === "unknown") and routes the user to profile setup.
      const finalState = get();
      if (finalState.user && finalState.profileStatus === "unknown") {
        set({ profileStatus: "missing" });
        finalStatus = "degraded";
      }

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
        const backendUser = await authenticateWithBackend(result.user);
        if (backendUser?.displayName) {
          set({ backendDisplayName: backendUser.displayName });
        }
      } else {
        // No redirect result (normal page load, result already consumed,
        // or third-party cookies blocked the redirect). Clear stale flag
        // to prevent false "sign-in failed" toasts on subsequent loads.
        sessionStorage.removeItem("googleRedirectPending");
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

      // Primary: Use popup (reliable across all modern browsers).
      // signInWithRedirect silently fails when third-party cookies are blocked
      // (Safari, Brave, Firefox ETP, Chrome Privacy Sandbox).
      if (isPopupSafe()) {
        const result = await signInWithPopup(auth, googleProvider);
        if (result.user) {
          // Update store immediately so callers see authenticated state
          // without waiting for the async onAuthStateChanged listener.
          set({ user: result.user, loading: false });

          const backendUser = await authenticateWithBackend(result.user);
          if (backendUser?.displayName) {
            set({ backendDisplayName: backendUser.displayName });
          }

          // Fetch profile and roles inline so profileStatus is resolved
          // before this function returns. The onAuthStateChanged listener
          // will see profileStatus !== "unknown" and skip its own fetch.
          const hydrated = await fetchProfileAndRoles(result.user.uid);
          set({
            profile: hydrated.profile,
            profileStatus: hydrated.profileStatus,
            ...(hydrated.roles ? { roles: hydrated.roles } : {}),
          });
        }
        return;
      }

      // Fallback: Redirect for environments where popups cannot open
      sessionStorage.setItem("googleRedirectPending", "true");
      await signInWithRedirect(auth, googleProvider);
    } catch (err: unknown) {
      const errCode = extractFirebaseErrorCode(err);

      if (isExpectedAuthError(err)) {
        logger.warn("[AuthStore] Google sign-in failed:", errCode);
      } else {
        logger.error("[AuthStore] Google sign-in error:", err);
      }

      // If popup was blocked by the browser, fall back to redirect flow
      if (errCode === "auth/popup-blocked") {
        logger.log("[AuthStore] Popup blocked, falling back to redirect");
        sessionStorage.setItem("googleRedirectPending", "true");
        await signInWithRedirect(auth, googleProvider);
        return;
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
      // Update store immediately so callers see authenticated state
      set({ user: result.user, loading: false });

      const backendUser = await authenticateWithBackend(result.user);
      if (backendUser?.displayName) {
        set({ backendDisplayName: backendUser.displayName });
      }

      // Fetch profile and roles inline so profileStatus is resolved
      // before this function returns.
      const hydrated = await fetchProfileAndRoles(result.user.uid);
      set({
        profile: hydrated.profile,
        profileStatus: hydrated.profileStatus,
        ...(hydrated.roles ? { roles: hydrated.roles } : {}),
      });
    } catch (err: unknown) {
      const errCode = extractFirebaseErrorCode(err);

      if (isExpectedAuthError(err)) {
        logger.warn("[AuthStore] Email sign-in failed:", errCode);
      } else {
        logger.error("[AuthStore] Email sign-in error:", err);
      }

      if (err instanceof Error) {
        set({ error: err });
      }
      // Safety net: if Firebase auth succeeded but a later step threw,
      // ensure profileStatus isn't stuck at "unknown" (infinite loading).
      const state = get();
      if (state.user && state.profileStatus === "unknown") {
        set({ profileStatus: "missing" });
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
      const backendUser = await authenticateWithBackend(result.user, {
        firstName,
        lastName,
        isRegistration: true,
      });
      if (backendUser?.displayName) {
        set({ backendDisplayName: backendUser.displayName });
      }
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
      // Branded verification email is sent server-side by authenticateWithBackend
      // when isRegistration=true (via Resend, not Firebase default templates)
    } catch (err: unknown) {
      logger.error("[AuthStore] Email sign-up error:", err);
      if (err instanceof Error) {
        set({ error: err });
      }
      throw err;
    }
  },

  sendPhoneVerification: async (phoneNumber: string, recaptchaContainerId: string) => {
    set({ error: null, phoneConfirmationResult: null });
    try {
      // Clear previous verifier to avoid "reCAPTCHA has already been rendered" errors
      if (activeRecaptchaVerifier) {
        activeRecaptchaVerifier.clear();
        activeRecaptchaVerifier = null;
      }
      const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, { size: "invisible" });
      activeRecaptchaVerifier = verifier;
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      set({ phoneConfirmationResult: confirmationResult });
    } catch (err: unknown) {
      logger.error("[AuthStore] Phone verification error:", err);
      if (err instanceof Error) {
        set({ error: err });
      }
      throw err;
    }
  },

  confirmPhoneCode: async (code: string, name?: string) => {
    set({ error: null });
    const confirmationResult = get().phoneConfirmationResult;
    if (!confirmationResult) {
      throw new Error("No phone verification in progress. Send a code first.");
    }
    try {
      const result = await confirmationResult.confirm(code);
      set({ phoneConfirmationResult: null });

      const parts = (name ?? "").trim().split(/\s+/);
      const firstName = parts[0] || undefined;
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
      const backendUser = await authenticateWithBackend(result.user, {
        firstName,
        lastName,
        isRegistration: true,
      });
      if (backendUser?.displayName) {
        set({ backendDisplayName: backendUser.displayName });
      }

      try {
        await setDoc(doc(db, "users", result.user.uid), {
          uid: result.user.uid,
          displayName: name?.trim() || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (firestoreErr) {
        logger.error("[AuthStore] Failed to create Firestore user doc:", firestoreErr);
      }
    } catch (err: unknown) {
      logger.error("[AuthStore] Phone code confirmation error:", err);
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
      // Clean up real-time listeners before signing out
      usePresenceStore.getState().disconnect();
      useChatStore.getState().disconnect();
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
        backendDisplayName: null,
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
      await apiRequest({
        method: "POST",
        path: "/api/auth/forgot-password",
        body: { email },
      });
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
