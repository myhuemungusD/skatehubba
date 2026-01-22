#!/usr/bin/env node

const REQUIRED_VITE = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const OPTIONAL_VITE = ["VITE_FIREBASE_MEASUREMENT_ID"];

const isProd = process.env.NODE_ENV === "production";
const isVercel = process.env.VERCEL === "1";
const allowMissing = process.env.ALLOW_MISSING_PUBLIC_ENV === "true";
const strict = (isVercel || isProd) && !allowMissing;

const missing = REQUIRED_VITE.filter((key) => !process.env[key]);
const expoPresent = REQUIRED_VITE.filter((key) => process.env[key.replace("VITE_", "EXPO_PUBLIC_")]);

if (missing.length > 0) {
  console.error("\n❌ Missing required public env vars for web build (VITE_*):");
  missing.forEach((key) => console.error(`  - ${key}`));

  if (expoPresent.length > 0) {
    console.error("\n⚠️  EXPO_PUBLIC_* equivalents were found, but Vite expects VITE_*.");
    expoPresent.forEach((key) =>
      console.error(`  - ${key} (found ${key.replace("VITE_", "EXPO_PUBLIC_")})`)
    );
  }

  console.error("\nSet these in Vercel (Project → Settings → Environment Variables).\n");

  if (strict) {
    process.exit(1);
  }
} else {
  console.log("✅ Public env check passed:");
  REQUIRED_VITE.forEach((key) => console.log(`  - ${key}`));
  OPTIONAL_VITE.forEach((key) => {
    if (process.env[key]) {
      console.log(`  - ${key} (optional)`);
    }
  });
}
