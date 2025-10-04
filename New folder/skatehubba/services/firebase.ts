import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  getFirestore, 
  serverTimestamp as firestoreTimestamp 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Environment variables must be configured in a .env.local file
// Copy .env.example to .env.local and fill in your Firebase config
// Supports both Next.js (NEXT_PUBLIC_) and Expo (EXPO_PUBLIC_) prefixes
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Validate required configuration
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('❌ Missing Firebase configuration. Please ensure .env.local is created from .env.example');
}

// Initialize Firebase app (prevent duplicate initialization)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize App Check (for production security)
const recaptchaKey = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
if (typeof window !== 'undefined' && recaptchaKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.warn('⚠️ App Check initialization failed:', error);
  }
}

// Initialize services
const auth = getAuth(app);

// Set persistence for web environments
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(() => {
    // Silently fail persistence setup - not critical
  });
}

const db = getFirestore(app);
const storage = getStorage(app);

// Server timestamp helper
const serverTimestamp = () => firestoreTimestamp();

export { app, auth, db, storage, onAuthStateChanged, serverTimestamp };