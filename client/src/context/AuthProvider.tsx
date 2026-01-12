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
  resetPassword as resetPasswordService,
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
    console.log('[AuthProvider] handleSignUp called:', { email, profileData });
    setError(null);
    setIsLoading(true);
    
    try {
      console.log('[AuthProvider] Calling signUpWithEmail...');
      const newUser = await signUpWithEmail(email, password, profileData);
      console.log('[AuthProvider] signUpWithEmail returned user:', newUser?.uid);
      const newProfile = await getOrCreateProfile(newUser, profileData);
      setUser(newUser);
      setProfile(newProfile);
    } catch (err) {
      console.error('[AuthProvider] signUp error:', err);
      const authError = err as AuthError;
      const errorMessage = authError.message || 'Sign up failed';
      console.error('[AuthProvider] Throwing error with message:', errorMessage);
      setError(errorMessage);
      // Re-throw with proper message
      const error = new Error(errorMessage);
      (error as any).code = authError.code;
      throw error;
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
      console.log('[AuthProvider] Calling signInWithEmail...');
      const authUser = await signInWithEmail(email, password);
      console.log('[AuthProvider] Sign in successful, fetching profile...');
      const userProfile = await getOrCreateProfile(authUser);
      console.log('[AuthProvider] Profile loaded');
      setUser(authUser);
      setProfile(userProfile);
    } catch (err) {
      console.error('[AuthProvider] Sign in error:', err);
      const authError = err as AuthError;
      const errorMessage = authError.message || 'Sign in failed';
      setError(errorMessage);
      // Re-throw with proper message
      const error = new Error(errorMessage);
      (error as any).code = authError.code;
      throw error;
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

  // Reset password
  const handleResetPassword = useCallback(async (email: string): Promise<void> => {
    setError(null);
    
    try {
      await resetPasswordService(email);
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
    resetPassword: handleResetPassword,
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
    handleResetPassword,
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
 * @returns Authentication context value (nullable if not in provider)
 */
export function useAuth(): AuthContextValue | null {
  const context = useContext(AuthContext);
  
  // Log warning but don't crash in development
  if (!context && import.meta.env.DEV) {
    console.warn(
      '[useAuth] Called outside AuthProvider. Some components may use this during initial render.'
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
  const auth = useAuth();
  return auth ? !auth.isLoading : false;
}

/**
 * Hook that returns the current user or throws if not authenticated
 * Useful for protected routes/components
 */
export function useRequiredAuth(): { user: AuthUser; profile: UserProfile | null } {
  const auth = useAuth();
  
  if (!auth || !auth.isAuthenticated || !auth.user) {
    throw new Error('User must be authenticated to access this resource.');
  }
  
  return { user: auth.user, profile: auth.profile };
}
