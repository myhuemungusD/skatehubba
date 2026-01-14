import { create } from "zustand";

export type UserRole = "skater" | "filmer" | "pro";

export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string | null;
  photoURL?: string | null;
  isPro: boolean;
  role: UserRole;
  xp: number;
  level: number;
}

interface UserProfileStore {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useUserProfileStore = create<UserProfileStore>((set) => ({
  user: null,
  loading: true,
  error: null,
  setUser: (user) => set({ user, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  clear: () => set({ user: null, loading: false, error: null }),
}));

let unsubscribeAuth: (() => void) | null = null;

export function useUserProfile() {
  const { user, loading, error, setUser, setLoading, setError, clear } =
    useUserProfileStore();

  const initializeAuth = async () => {
    if (typeof window === "undefined") return;

    try {
      setLoading(true);
      const { auth, db } = await import("../firebase");
      const { onAuthStateChanged } = await import("firebase/auth");
      const { doc, getDoc } = await import("firebase/firestore");

      if (unsubscribeAuth) {
        unsubscribeAuth();
      }

      unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            let isPro = false;
            let role: UserRole = "skater";
            let xp = 0;

            try {
              const profileRef = doc(db, "users", firebaseUser.uid);
              const profileSnap = await getDoc(profileRef);
              if (profileSnap.exists()) {
                const data = profileSnap.data();
                isPro = data.isPro ?? false;
                role = data.role ?? "skater";
                xp = data.xp ?? 0;
              }
            } catch {
              console.warn("Could not fetch Firestore profile, using defaults");
            }

            const level = Math.floor(xp / 500) + 1;

            setUser({
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || "Skater",
              email: firebaseUser.email,
              photoURL: firebaseUser.photoURL,
              isPro,
              role,
              xp,
              level,
            });
          } catch (err) {
            console.error("Error fetching user profile:", err);
            setError("Failed to load user profile");
          }
        } else {
          clear();
        }
      });
    } catch (err) {
      console.error("Firebase initialization error:", err);
      setError("Failed to initialize authentication");
    }
  };

  return {
    user,
    loading,
    error,
    initializeAuth,
    clear,
  };
}

export function cleanupUserAuth() {
  if (unsubscribeAuth) {
    unsubscribeAuth();
    unsubscribeAuth = null;
  }
  useUserProfileStore.getState().clear();
}
