import { initializeApp, getApps } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Import from enterprise config package for universal env handling
import {
  getFirebaseConfig as getSharedFirebaseConfig,
  assertEnvWiring,
  getEnvBanner,
  getAppEnv,
  isProd,
  isStaging,
  validateEnv,
} from "@skatehubba/config";

// Validate environment (warns in dev, throws only when guardrails fail)
validateEnv();

try {
  assertEnvWiring();
} catch (error) {
  console.error("[Firebase Mobile] Environment mismatch detected!", error);
  if (isProd()) {
    throw error;
  }
}

// Get Firebase configuration from shared package
const firebaseConfig = getSharedFirebaseConfig();

// Log environment on startup (non-prod only)
if (!isProd()) {
  const banner = getEnvBanner();
  if (banner) {
    console.log(`[Firebase Mobile] ${banner}`);
  }
  console.log(`[Firebase Mobile] Environment: ${getAppEnv()}`);
  console.log(`[Firebase Mobile] Project: ${firebaseConfig.projectId}`);
}

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firebase Auth with React Native persistence
// Only call initializeAuth on first load, use getAuth for subsequent loads
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  // Auth already initialized, get existing instance
  auth = getAuth(app);
}

const db = getFirestore(app);
const functions = getFunctions(app);
const storage = getStorage(app);

export { app, auth, db, functions, storage, getAppEnv, isProd, isStaging };
