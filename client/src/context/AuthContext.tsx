/**
 * AuthContext and AuthProvider
 * Manages authentication state across the application with persistent sessions
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode
} from 'react';
import { User } from 'firebase/auth';
import {
  AuthContextValue,
  AuthState
} from '../types/auth';
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle as signInWithGoogleService,
  handleGoogleRedirectResult,
  signOutUser,
  subscribeToAuthState,
  fetchUserProfile,
  toFirebaseUserData
} from '../lib/authService';

type GoogleRedirectResult = Awaited<ReturnType<typeof handleGoogleRedirectResult>>;

const initialState: AuthState = {
  firebaseUser: null,
  userProfile: null,
  isLoading: true,
  error: null
};

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState);

  // Subscribe to Firebase auth state changes on mount
  useEffect(() => {
    // Check for Google redirect result first
    handleGoogleRedirectResult()
      .then((result: GoogleRedirectResult) => {
        if (result) {
          setState({
            firebaseUser: result.firebaseUser,
            userProfile: result.userProfile,
            isLoading: false,
            error: null
          });
        }
      })
      .catch((error: unknown) => {
        console.error('[AuthProvider] Google redirect error:', error);
      });

    const unsubscribe = subscribeToAuthState(async (firebaseUser: User | null) => {
      if (firebaseUser) {
        try {
          // Fetch user profile from Firestore
          const userProfile = await fetchUserProfile(firebaseUser.uid);
          
          setState({
            firebaseUser: toFirebaseUserData(firebaseUser),
            userProfile,
            isLoading: false,
            error: null
          });
        } catch (error) {
          console.error('[AuthProvider] Failed to fetch user profile:', error);
          setState({
            firebaseUser: toFirebaseUserData(firebaseUser),
            userProfile: null,
            isLoading: false,
            error: 'Failed to load user profile'
          });
        }
      } else {
        setState({
          firebaseUser: null,
          userProfile: null,
          isLoading: false,
          error: null
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const { firebaseUser, userProfile } = await signUpWithEmail(email, password);
      
      setState({
        firebaseUser,
        userProfile,
        isLoading: false,
        error: null
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign up failed';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const { firebaseUser, userProfile } = await signInWithEmail(email, password);
      
      setState({
        firebaseUser,
        userProfile,
        isLoading: false,
        error: null
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const { firebaseUser, userProfile } = await signInWithGoogleService();
      
      // If uid is empty, it means redirect was triggered (mobile/popup blocked)
      if (firebaseUser.uid) {
        setState({
          firebaseUser,
          userProfile,
          isLoading: false,
          error: null
        });
      }
      // Otherwise, state will be updated by the redirect handler
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Google sign in failed';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      await signOutUser();
      
      setState({
        firebaseUser: null,
        userProfile: null,
        isLoading: false,
        error: null
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign out failed';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  // User is authenticated if they have a Firebase user
  const isAuthenticated = state.firebaseUser !== null;

  const value: AuthContextValue = {
    ...state,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    isAuthenticated
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 * Must be used within an AuthProvider
 */
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  
  return context;
}
