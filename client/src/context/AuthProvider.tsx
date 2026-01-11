/**
 * Authentication Context
 * 
 * React Context for managing authentication state across the application.
 * Provides auth state, user profile, and auth actions to all components.
 * 
 * Usage:
 * ```tsx
 * // In App.tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * 
 * // In any component
 * const { user, profile, signIn, signOut } = useAuth();
 * ```
 * 
 * @module context/AuthContext
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  getGoogleRedirectResult,
  signOutUser,
  onAuthStateChange,
  getOrCreateProfile,
  AuthUser,
  UserProfile,
  AuthContextValue,
  AuthError,
} from '../lib/firebase/index';

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handle auth state changes
  useEffect(() => {
    // Check for Google redirect result on mount
    getGoogleRedirectResult()
      .then(async (redirectUser) => {
        if (redirectUser) {
          const userProfile = await getOrCreateProfile(redirectUser);
          setUser(redirectUser);
          setProfile(userProfile);
        }
      })
      .catch((err: AuthError) => {
        console.error('[AuthProvider] Redirect result error:', err.message);
      });

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChange(async (authUser) => {
      try {
        if (authUser) {
          const userProfile = await getOrCreateProfile(authUser);
          setUser(authUser);
          setProfile(userProfile);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('[AuthProvider] Profile error:', err);
        setUser(authUser);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Sign up with email/password
  const handleSignUp = useCallback(async (
    email: string,
    password: string,
    profileData?: { firstName?: string; lastName?: string }
  ): Promise<void> => {
    setError(null);
    setIsLoading(true);
    
    try {
      const newUser = await signUpWithEmail(email, password, profileData);
      const newProfile = await getOrCreateProfile(newUser, profileData);
      setUser(newUser);
      setProfile(newProfile);
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sign in with email/password
  const handleSignIn = useCallback(async (
    email: string,
    password: string
  ): Promise<void> => {
    setError(null);
    setIsLoading(true);
    
    try {
      const authUser = await signInWithEmail(email, password);
      const userProfile = await getOrCreateProfile(authUser);
      setUser(authUser);
      setProfile(userProfile);
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sign in with Google
  const handleSignInWithGoogle = useCallback(async (): Promise<void> => {
    setError(null);
    setIsLoading(true);
    
    try {
      const authUser = await signInWithGoogle();
      
      // If null, redirect was triggered - auth state listener will handle it
      if (authUser) {
        const userProfile = await getOrCreateProfile(authUser);
        setUser(authUser);
        setProfile(userProfile);
      }
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message);
      setIsLoading(false);
      throw err;
    }
  }, []);

  // Sign out
  const handleSignOut = useCallback(async (): Promise<void> => {
    setError(null);
    
    try {
      await signOutUser();
      setUser(null);
      setProfile(null);
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message);
      throw err;
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Memoize context value
  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    isLoading,
    isAuthenticated: user !== null,
    error,
    signUp: handleSignUp,
    signIn: handleSignIn,
    signInWithGoogle: handleSignInWithGoogle,
    signOut: handleSignOut,
    clearError,
  }), [
    user,
    profile,
    isLoading,
    error,
    handleSignUp,
    handleSignIn,
    handleSignInWithGoogle,
    handleSignOut,
    clearError,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access authentication context
 * Must be used within an AuthProvider
 * 
 * @returns Authentication context value
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider. ' +
      'Wrap your app with <AuthProvider> in your root component.'
    );
  }
  
  return context;
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook that returns true only when auth is ready (not loading)
 */
export function useAuthReady(): boolean {
  const { isLoading } = useAuth();
  return !isLoading;
}

/**
 * Hook that returns the current user or throws if not authenticated
 * Useful for protected routes/components
 */
export function useRequiredAuth(): { user: AuthUser; profile: UserProfile | null } {
  const { user, profile, isAuthenticated } = useAuth();
  
  if (!isAuthenticated || !user) {
    throw new Error('User must be authenticated to access this resource.');
  }
  
  return { user, profile };
}
