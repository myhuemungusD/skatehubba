import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth, 
  getReactNativePersistence, 
  onAuthStateChanged as onAuthChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  getFirestore, 
  enableIndexedDbPersistence,
  serverTimestamp as firestoreTimestamp 
} from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// App Check imports (web only)
let initializeAppCheck, ReCaptchaV3Provider;
try {
  if (typeof window !== 'undefined') {
    const appCheck = require('firebase/app-check');
    initializeAppCheck = appCheck.initializeAppCheck;
    ReCaptchaV3Provider = appCheck.ReCaptchaV3Provider;
  }
} catch (error) {
  // App Check not available - React Native environment
}

// Environment variables must be configured in a .env.local file
// Copy .env.example to .env.local and fill in your Firebase config
// Supports both Next.js (NEXT_PUBLIC_) and Expo (EXPO_PUBLIC_) prefixes
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Validate required configuration
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('❌ Missing Firebase configuration. Please ensure .env.local is created from .env.example');
}

// Initialize Firebase app (prevent duplicate initialization)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize App Check (for web environments only)
if (typeof window !== 'undefined' && initializeAppCheck && ReCaptchaV3Provider) {
  const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY;
  if (recaptchaKey) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaKey),
        isTokenAutoRefreshEnabled: true
      });
    } catch (error) {
      console.warn('⚠️ App Check initialization failed:', error);
    }
  }
}

// Initialize services
let auth;
try {
  // For React Native - use AsyncStorage persistence
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  // If auth already initialized, get existing instance
  auth = getAuth(app);
  
  // Set persistence for web environments
  if (typeof window !== 'undefined') {
    setPersistence(auth, browserLocalPersistence).catch(console.warn);
  }
}

export const db = getFirestore(app);
export const storage = getStorage(app);

// Authentication state observer
export const onAuthStateChanged = (callback) => {
  return onAuthChanged(auth, callback);
};

// Error handling wrapper for Firebase operations
export const handleFirebaseError = (error) => {
  console.error('Firebase Error:', error);
  
  // Map Firebase error codes to user-friendly messages
  const errorMessages = {
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/email-already-in-use': 'An account already exists with this email',
    'auth/invalid-email': 'Invalid email address',
    'auth/weak-password': 'Password should be at least 6 characters',
    'permission-denied': 'You do not have permission to perform this action',
    'not-found': 'The requested resource was not found',
  };

  return {
    code: error.code,
    message: errorMessages[error.code] || 'An unexpected error occurred'
  };
};

// Firestore timestamp
export const serverTimestamp = () => {
  return firestoreTimestamp();
};

// Storage helpers
export const getStorageUrl = async (path) => {
  try {
    const reference = ref(storage, path);
    return await getDownloadURL(reference);
  } catch (error) {
    throw handleFirebaseError(error);
  }
};
