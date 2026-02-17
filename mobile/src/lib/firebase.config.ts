import { initializeApp, getApps } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence, type Auth } from "firebase/auth";
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
  if (__DEV__) {
    console.error("[Firebase Mobile] Environment mismatch detected!", error);
  }
  if (isProd()) {
    throw error;
  }
}

// Get Firebase configuration from shared package
const firebaseConfig = getSharedFirebaseConfig();

// Log environment on startup (dev builds only, guarded by __DEV__ for safety)
if (__DEV__ && !isProd()) {
  const banner = getEnvBanner();
  if (banner) {
    console.log(`[Firebase Mobile] ${banner}`);
  }
  console.log(`[Firebase Mobile] Environment: ${getAppEnv()}`);
}

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firebase Auth with React Native persistence
// Only call initializeAuth on first load, use getAuth for subsequent loads
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Auth already initialized, get existing instance
  auth = getAuth(app);
}

const db = getFirestore(app);
const functions = getFunctions(app);
const storage = getStorage(app);

// Initialize certificate pinning monitoring and Firebase App Check.
// App Check receives `app` as a parameter to avoid a circular import.
import { initCertificatePinning } from "@/lib/certificatePinning";
import { initAppCheck } from "@/lib/appCheck";

initCertificatePinning();
initAppCheck(app);

export { app, auth, db, functions, storage, getAppEnv, isProd, isStaging };
