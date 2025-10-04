import { auth, db, serverTimestamp } from './firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  updateProfile,
  signInAnonymously,
  linkWithCredential
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';

// Auth error types
export type AuthError = {
  ok: false;
  code: string;
  message: string;
}

export type AuthSuccess = {
  ok: true;
  user?: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  };
}

export type AuthResult = AuthSuccess | AuthError;

// Error mapping for user-friendly messages
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/user-not-found': 'No account found with this email',
  'auth/wrong-password': 'Incorrect password',
  'auth/email-already-in-use': 'An account already exists with this email',
  'auth/invalid-email': 'Invalid email address',
  'auth/weak-password': 'Password should be at least 6 characters',
  'auth/popup-closed-by-user': 'Sign-in cancelled',
  'auth/popup-blocked': 'Pop-up blocked. Please allow pop-ups and try again',
  'auth/network-request-failed': 'Network error. Please check your connection',
  'auth/too-many-requests': 'Too many failed attempts. Please try again later',
  'permission-denied': 'You do not have permission to perform this action',
  'not-found': 'The requested resource was not found',
};

function mapAuthError(error: any): AuthError {
  return {
    ok: false,
    code: error.code ?? 'auth/unknown-error',
    message: AUTH_ERROR_MESSAGES[error.code] ?? error.message ?? 'An unexpected error occurred'
  };
}

// Create or update user document in Firestore
async function createOrUpdateUserDoc(user: any, isNewUser = false): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  
  if (isNewUser) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      avatarUrl: user.photoURL ?? null,
      xp: 0,
      roles: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // User doc doesn't exist, create it
      await createOrUpdateUserDoc(user, true);
    } else {
      // Update existing user doc
      await updateDoc(ref, { 
        updatedAt: serverTimestamp(),
        // Update profile info if it changed
        displayName: user.displayName ?? snap.data().displayName,
        email: user.email ?? snap.data().email,
        avatarUrl: user.photoURL ?? snap.data().avatarUrl,
      });
    }
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    
    const cred = await signInWithPopup(auth, provider);
    const user = cred.user;
    
    await createOrUpdateUserDoc(user);
    
    return { 
      ok: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
      }
    };
  } catch (error: any) {
    return mapAuthError(error);
  }
}

export async function signInAnonymouslyWithUpgrade(): Promise<AuthResult> {
  try {
    const cred = await signInAnonymously(auth);
    const user = cred.user;
    
    // Create anonymous user doc with minimal data
    await createOrUpdateUserDoc({
      uid: user.uid,
      displayName: null,
      email: null,
      photoURL: null
    }, true);
    
    return { 
      ok: true,
      user: {
        uid: user.uid,
        email: null,
        displayName: null,
        photoURL: null
      }
    };
  } catch (error: any) {
    return mapAuthError(error);
  }
}

export async function upgradeAnonymousWithGoogle(): Promise<AuthResult> {
  try {
    const user = auth.currentUser;
    if (!user || !user.isAnonymous) {
      return {
        ok: false,
        code: 'auth/invalid-user',
        message: 'No anonymous user to upgrade'
      };
    }
    
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    
    const cred = GoogleAuthProvider.credential();
    const linkResult = await linkWithCredential(user, cred);
    
    await createOrUpdateUserDoc(linkResult.user);
    
    return { 
      ok: true,
      user: {
        uid: linkResult.user.uid,
        email: linkResult.user.email,
        displayName: linkResult.user.displayName,
        photoURL: linkResult.user.photoURL
      }
    };
  } catch (error: any) {
    return mapAuthError(error);
  }
}

export async function updateUserProfile(displayName: string, photoURL?: string): Promise<AuthResult> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return {
        ok: false,
        code: 'auth/no-current-user',
        message: 'No user is currently signed in'
      };
    }
    
    await updateProfile(user, { displayName, photoURL });
    await createOrUpdateUserDoc(user);
    
    return { ok: true };
  } catch (error: any) {
    return mapAuthError(error);
  }
}

export async function logout(): Promise<AuthResult> {
  try {
    await signOut(auth);
    return { ok: true };
  } catch (error: any) {
    return mapAuthError(error);
  }
}

// Helper to get current user data
export function getCurrentUser() {
  const user = auth.currentUser;
  if (!user) return null;
  
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous
  };
}