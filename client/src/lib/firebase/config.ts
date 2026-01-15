// client/src/lib/firebase/config.ts

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

/**
 * Returns the Firebase configuration from Vite environment variables.
 * Fails fast if required variables are missing.
 */
export function getFirebaseConfig(): FirebaseConfig {
  const config: FirebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  // DEV-only diagnostics (never logs secrets in prod)
  if (import.meta.env.DEV) {
    console.log(
      "[Firebase] Config source:",
      config.apiKey ? "Environment variables" : "MISSING ENV VARS"
    );

    if (!config.apiKey || !config.projectId) {
      console.warn(
        "[Firebase] Missing required Firebase env vars (VITE_FIREBASE_*)"
      );
    }
  }

  // Hard fail if required config is missing
  if (!config.apiKey || !config.projectId) {
    throw new Error(
      "Firebase config is incomplete. Check VITE_FIREBASE_* environment variables."
    );
  }

  return config;
}
