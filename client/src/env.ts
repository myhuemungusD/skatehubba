const REQUIRED_PUBLIC_ENV = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

type RequiredEnvKey = (typeof REQUIRED_PUBLIC_ENV)[number];

export function getMissingRequiredEnv(): RequiredEnvKey[] {
  return REQUIRED_PUBLIC_ENV.filter((key) => {
    const value = import.meta.env[key];
    return !value || value.trim() === "";
  });
}

export function requireEnv(name: RequiredEnvKey): string {
  const value = import.meta.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getRequiredEnv() {
  return {
    FIREBASE_API_KEY: requireEnv("VITE_FIREBASE_API_KEY"),
    FIREBASE_AUTH_DOMAIN: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    FIREBASE_PROJECT_ID: requireEnv("VITE_FIREBASE_PROJECT_ID"),
    FIREBASE_STORAGE_BUCKET: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    FIREBASE_MESSAGING_SENDER_ID: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    FIREBASE_APP_ID: requireEnv("VITE_FIREBASE_APP_ID"),
  };
}
