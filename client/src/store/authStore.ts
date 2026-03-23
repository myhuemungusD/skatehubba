import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../lib/firebase/config";
import { api } from "../lib/api/client";

interface UserProfile {
  id: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  photoURL: string | null;
  stance: string | null;
  homeSpot: string | null;
  wins: number;
  losses: number;
}

interface BackendUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isEmailVerified: boolean;
  roles?: string[];
}

interface AuthState {
  firebaseUser: FirebaseUser | null;
  backendUser: BackendUser | null;
  profile: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;

  initialize: () => void;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  firebaseUser: null,
  backendUser: null,
  profile: null,
  loading: true,
  initialized: false,
  error: null,

  initialize: () => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const data = await api.get<{ user: BackendUser; profile: UserProfile | null }>(
            "/auth/me"
          );
          set({
            firebaseUser: user,
            backendUser: data.user,
            profile: data.profile,
            loading: false,
            initialized: true,
          });
        } catch {
          // User exists in Firebase but not yet synced to backend
          try {
            const loginData = await api.post<{ user: BackendUser }>("/auth/login");
            set({
              firebaseUser: user,
              backendUser: loginData.user,
              profile: null,
              loading: false,
              initialized: true,
            });
          } catch {
            set({ firebaseUser: user, loading: false, initialized: true });
          }
        }
      } else {
        set({
          firebaseUser: null,
          backendUser: null,
          profile: null,
          loading: false,
          initialized: true,
        });
      }
    });
  },

  signInWithEmail: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle the rest
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Sign in failed" });
      throw err;
    }
  },

  signUpWithEmail: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Sign up failed" });
      throw err;
    }
  },

  signInWithGoogle: async () => {
    set({ loading: true, error: null });
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Google sign in failed" });
      throw err;
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth);
    set({ firebaseUser: null, backendUser: null, profile: null });
  },

  fetchProfile: async () => {
    try {
      const data = await api.get<{ user: BackendUser; profile: UserProfile | null }>("/auth/me");
      set({ backendUser: data.user, profile: data.profile });
    } catch {
      // Ignore — profile may not exist yet
    }
  },

  clearError: () => set({ error: null }),
}));
