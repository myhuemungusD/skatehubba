const REQUIRED_PUBLIC_ENV = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
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
    FIREBASE_API_KEY: requireEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
    FIREBASE_AUTH_DOMAIN: requireEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    FIREBASE_PROJECT_ID: requireEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    FIREBASE_STORAGE_BUCKET: requireEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    FIREBASE_MESSAGING_SENDER_ID: requireEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    FIREBASE_APP_ID: requireEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
  };
}
