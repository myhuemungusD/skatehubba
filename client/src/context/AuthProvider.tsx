/**
 * AuthProvider - Production-Grade Authentication Context
 * 
 * The single source of truth for authentication state in the application.
 * Handles Firebase Auth, user profiles, and role-based access control.
 * 
 * Features:
 * - Firebase Auth integration with Google, Email, and Anonymous sign-in
 * - Automatic profile fetching/creation
 * - Role-based access control (RBAC) with custom claims
 * - Token refresh for role updates
 * - Clean loading states with render gating
 * - Comprehensive error handling
 * 
 * @example
 * ```tsx
 * // Wrap your app
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * 
 * // Use in any component
 * const { user, profile, roles, isAdmin, signInWithGoogle, signOut } = useAuth();
 * ```
 * 
 * @module context/AuthProvider
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously as firebaseSignInAnonymously,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  getIdTokenResult,
  GoogleAuthProvider,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase/config';

// ============================================================================
// Types
// ============================================================================

/** Valid user roles in the system */
export type UserRole = 'admin' | 'moderator' | 'verified_pro';

/** User profile stored in Firestore */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  photoURL?: string | null;
  roles?: UserRole[];
  createdAt: Date;
  updatedAt: Date;
}

/** Auth context value available to all components */
export interface AuthContextType {
  // State
  user: FirebaseUser | null;
  profile: UserProfile | null;
  roles: UserRole[];
  loading: boolean;
  error: Error | null;
  
  // Computed
  isAuthenticated: boolean;
  isAdmin: boolean;
  isVerifiedPro: boolean;
  isModerator: boolean;
  
  // Actions
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshRoles: () => Promise<UserRole[]>;
  hasRole: (role: UserRole) => boolean;
  clearError: () => void;
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextType | null>(null);

// ============================================================================
// Hook
// ============================================================================

/**
 * Access authentication state and actions
 * Must be used within an AuthProvider
 * 
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// ============================================================================
// Provider
// ============================================================================

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

interface AuthProviderProps {
  children: ReactNode;
  /** Optional loading component */
  LoadingComponent?: React.ComponentType;
}

export function AuthProvider({ children, LoadingComponent }: AuthProviderProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Transform Firestore data to UserProfile
   */
  const transformProfile = useCallback((uid: string, data: any): UserProfile => {
    return {
      uid,
      email: data.email || '',
      displayName: data.displayName || '',
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      photoURL: data.photoURL || null,
      roles: data.roles || [],
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
    };
  }, []);

  /**
   * Fetch user profile from Firestore
   */
  const fetchProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    try {
      const docRef = doc(db, 'users', uid);
      const snapshot = await getDoc(docRef);
      
      if (snapshot.exists()) {
        return transformProfile(uid, snapshot.data());
      }
      return null;
    } catch (err) {
      console.error('[AuthProvider] Failed to fetch profile:', err);
      return null;
    }
  }, [transformProfile]);

  /**
   * Create user profile in Firestore
   */
  const createProfile = useCallback(async (
    firebaseUser: FirebaseUser,
    displayName?: string
  ): Promise<UserProfile> => {
    const docRef = doc(db, 'users', firebaseUser.uid);
    
    const profileData = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
      firstName: null,
      lastName: null,
      photoURL: firebaseUser.photoURL || null,
      roles: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, profileData);
    
    return {
      ...profileData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }, []);

  /**
   * Get or create user profile
   */
  const getOrCreateProfile = useCallback(async (
    firebaseUser: FirebaseUser,
    displayName?: string
  ): Promise<UserProfile> => {
    const existing = await fetchProfile(firebaseUser.uid);
    if (existing) return existing;
    return createProfile(firebaseUser, displayName);
  }, [fetchProfile, createProfile]);

  /**
   * Extract roles from Firebase token
   */
  const extractRolesFromToken = useCallback(async (firebaseUser: FirebaseUser): Promise<UserRole[]> => {
    try {
      const tokenResult = await getIdTokenResult(firebaseUser);
      return (tokenResult.claims.roles as UserRole[]) || [];
    } catch (err) {
      console.error('[AuthProvider] Failed to extract roles:', err);
      return [];
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Auth State Listener
  // ---------------------------------------------------------------------------

  useEffect(() => {
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // User is signed in
          setUser(firebaseUser);
          
          // Fetch profile and roles in parallel
          const [userProfile, userRoles] = await Promise.all([
            getOrCreateProfile(firebaseUser),
            extractRolesFromToken(firebaseUser),
          ]);
          
          setProfile(userProfile);
          setRoles(userRoles);
          setError(null);
        } else {
          // User is signed out
          setUser(null);
          setProfile(null);
          setRoles([]);
        }
      } catch (err: any) {
        console.error('[AuthProvider] Auth state change error:', err);
        setError(err);
        // Still set the user even if profile fetch fails
        setUser(firebaseUser);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [getOrCreateProfile, extractRolesFromToken]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    setError(null);
    
    try {
      // Detect mobile for redirect flow
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      
      if (isMobile) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
      // Auth state listener will handle the rest
    } catch (err: any) {
      console.error('[AuthProvider] Google sign-in error:', err);
      
      // Handle popup blocked - fallback to redirect
      if (err.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      
      setError(err);
      throw err;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<void> => {
    setError(null);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error('[AuthProvider] Email sign-in error:', err);
      setError(err);
      throw err;
    }
  }, []);

  const signUpWithEmail = useCallback(async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<void> => {
    setError(null);
    
    try {
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create profile with display name
      await createProfile(firebaseUser, displayName);
    } catch (err: any) {
      console.error('[AuthProvider] Email sign-up error:', err);
      setError(err);
      throw err;
    }
  }, [createProfile]);

  const signInAnonymously = useCallback(async (): Promise<void> => {
    setError(null);
    
    try {
      await firebaseSignInAnonymously(auth);
    } catch (err: any) {
      console.error('[AuthProvider] Anonymous sign-in error:', err);
      setError(err);
      throw err;
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    setError(null);
    
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setProfile(null);
      setRoles([]);
    } catch (err: any) {
      console.error('[AuthProvider] Sign-out error:', err);
      setError(err);
      throw err;
    }
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    setError(null);
    
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      console.error('[AuthProvider] Password reset error:', err);
      setError(err);
      throw err;
    }
  }, []);

  /**
   * Force refresh the user's token to get updated roles
   * Call this after an admin assigns new roles
   */
  const refreshRoles = useCallback(async (): Promise<UserRole[]> => {
    if (!user) return [];
    
    try {
      const currentUser = auth.currentUser;
      
      if (!currentUser) return [];
      
      // Force refresh the token
      const tokenResult = await getIdTokenResult(currentUser, true);
      const newRoles = (tokenResult.claims.roles as UserRole[]) || [];
      
      setRoles(newRoles);
      console.log('[AuthProvider] Roles refreshed:', newRoles);
      
      return newRoles;
    } catch (err: any) {
      console.error('[AuthProvider] Failed to refresh roles:', err);
      return roles;
    }
  }, [user, roles]);

  const hasRole = useCallback((role: UserRole): boolean => {
    return roles.includes(role);
  }, [roles]);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value = useMemo<AuthContextType>(() => ({
    // State
    user,
    profile,
    roles,
    loading,
    error,
    
    // Computed
    isAuthenticated: user !== null,
    isAdmin: roles.includes('admin'),
    isVerifiedPro: roles.includes('verified_pro'),
    isModerator: roles.includes('moderator'),
    
    // Actions
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAnonymously,
    signOut,
    resetPassword,
    refreshRoles,
    hasRole,
    clearError,
  }), [
    user,
    profile,
    roles,
    loading,
    error,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAnonymously,
    signOut,
    resetPassword,
    refreshRoles,
    hasRole,
    clearError,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Show loading state while bootstrapping
  if (loading) {
    if (LoadingComponent) {
      return <LoadingComponent />;
    }
    
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#181818]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading SkateHubba...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default AuthProvider;
export { AuthContext };
