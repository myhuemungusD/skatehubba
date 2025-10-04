import { create } from 'zustand';
import { onAuthStateChanged, auth } from '../services/firebase';

// User state type
export type UserState = {
  // Auth state
  uid: string | null;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  
  // App state
  ready: boolean;
  loading: boolean;
  
  // User data from Firestore
  xp: number;
  roles: string[];
  
  // Actions
  setUser: (user: Partial<UserState>) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
};

// Initial state
const initialState = {
  uid: null,
  email: null,
  displayName: null,
  photoURL: null,
  isAnonymous: false,
  ready: false,
  loading: true,
  xp: 0,
  roles: [],
};

// Create the store
export const useUserStore = create<UserState>((set, get) => ({
  ...initialState,
  
  setUser: (userData) => set((state) => ({ ...state, ...userData })),
  
  setLoading: (loading) => set({ loading }),
  
  reset: () => set({ ...initialState, ready: true, loading: false }),
}));

// Initialize auth state listener
let authInitialized = false;

export function initializeAuthListener() {
  if (authInitialized) return;
  authInitialized = true;
  
  onAuthStateChanged(auth, (user) => {
    const { setUser, reset } = useUserStore.getState();
    
    if (user) {
      setUser({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        isAnonymous: user.isAnonymous,
        ready: true,
        loading: false,
      });
    } else {
      reset();
    }
  });
}

// Convenience hooks
export const useUser = () => {
  const user = useUserStore();
  
  // Initialize auth listener on first use
  if (!authInitialized) {
    initializeAuthListener();
  }
  
  return user;
};

export const useAuth = () => {
  const { uid, ready, loading } = useUserStore();
  
  return {
    isAuthenticated: !!uid,
    isAnonymous: useUserStore().isAnonymous,
    isReady: ready,
    isLoading: loading,
  };
};