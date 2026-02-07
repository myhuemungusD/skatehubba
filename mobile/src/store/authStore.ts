import { create } from "zustand";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase.config";

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
      set({ user: null });
    } catch {
      // Sign out failed silently
    }
  },
}));
