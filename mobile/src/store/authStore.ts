import { create } from "zustand";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase.config";
import { clearAnalyticsSession } from "@/lib/analytics/logEvent";

interface AuthState {
  user: User | null;
  isInitialized: boolean;
  initialize: () => () => void;
  signOut: () => Promise<void>;
}

let authUnsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isInitialized: false,

  initialize: () => {
    if (authUnsubscribe) return authUnsubscribe;
    authUnsubscribe = onAuthStateChanged(auth, (user) => {
      set({ user, isInitialized: true });
    });
    return authUnsubscribe;
  },

  signOut: async () => {
    try {
      await firebaseSignOut(auth);
      // Clear analytics session to prevent cross-account session tracking
      await clearAnalyticsSession();
      set({ user: null });
    } catch (error) {
      if (__DEV__) {
        console.error("[AuthStore] Sign out failed", error);
      }
    }
  },
}));
