import { create } from "zustand";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import type { Auth, User } from "firebase/auth";

export interface BaseAuthState {
  user: User | null;
  isInitialized: boolean;
}

export interface BaseAuthActions {
  initialize: () => () => void;
  signOut: () => Promise<void>;
}

export type BaseAuthStore = BaseAuthState & BaseAuthActions;

/**
 * Creates a minimal Zustand auth store that tracks Firebase auth state.
 *
 * @param auth - The Firebase Auth instance for this platform.
 * @param onSignOut - Optional platform-specific cleanup run after Firebase sign-out
 *   (e.g. clearing analytics sessions or offline caches).
 */
export function createBaseAuthStore(
  auth: Auth,
  onSignOut?: () => Promise<void>,
) {
  let unsubscribe: (() => void) | null = null;

  return create<BaseAuthStore>((set) => ({
    user: null,
    isInitialized: false,

    initialize() {
      if (unsubscribe) return unsubscribe;
      unsubscribe = onAuthStateChanged(auth, (user) => {
        set({ user, isInitialized: true });
      });
      return unsubscribe;
    },

    async signOut() {
      try {
        await firebaseSignOut(auth);
        if (onSignOut) await onSignOut();
        set({ user: null });
      } catch (error) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.error("[AuthStore] Sign out failed", error);
        }
      }
    },
  }));
}
