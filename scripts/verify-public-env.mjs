#!/usr/bin/env node

const REQUIRED_PUBLIC_VARS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const OPTIONAL_PUBLIC_VARS = ["VITE_FIREBASE_MEASUREMENT_ID"];

const missing = REQUIRED_PUBLIC_VARS.filter((key) => !process.env[key]);

if (missing.length > 0) {
  const expoCandidates = REQUIRED_PUBLIC_VARS.filter((key) =>
    process.env[key.replace("VITE_", "EXPO_PUBLIC_")]
  );

  console.error("\n❌ Missing required public env vars for web build (VITE_*):");
  missing.forEach((key) => console.error(`  - ${key}`));

  if (expoCandidates.length > 0) {
    console.error("\n⚠️  EXPO_PUBLIC_* equivalents were found, but Vite expects VITE_*.");
    expoCandidates.forEach((key) =>
      console.error(`  - ${key} (found ${key.replace("VITE_", "EXPO_PUBLIC_")})`)
    );
  }

  console.error("\nSet these in Vercel (Project → Settings → Environment Variables).\n");
  process.exit(1);
}

console.log("✅ Public env check passed:");
REQUIRED_PUBLIC_VARS.forEach((key) => console.log(`  - ${key}`));
OPTIONAL_PUBLIC_VARS.forEach((key) => {
  if (process.env[key]) {
    console.log(`  - ${key} (optional)`);
  }
});
