#!/usr/bin/env node

const REQUIRED_KEYS = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
];

const OPTIONAL_KEYS = ["FIREBASE_MEASUREMENT_ID"];

const isProd = process.env.NODE_ENV === "production";
const isVercel = process.env.VERCEL === "1";
const allowMissing = process.env.ALLOW_MISSING_PUBLIC_ENV === "true";
const strict = (isVercel || isProd) && !allowMissing;

/**
 * Resolve a key by checking EXPO_PUBLIC_ first, then VITE_ fallback.
 * Returns the resolved value or undefined.
 */
function resolveKey(key) {
  return process.env[`EXPO_PUBLIC_${key}`] || process.env[`VITE_${key}`];
}

const missing = REQUIRED_KEYS.filter((key) => !resolveKey(key));

if (missing.length > 0) {
  console.error("\n\u274C Missing required public env vars for web build:");
  missing.forEach((key) =>
    console.error(`  - EXPO_PUBLIC_${key} (or VITE_${key})`)
  );

  console.error("\nSet these in Vercel (Project \u2192 Settings \u2192 Environment Variables).\n");

  if (strict) {
    process.exit(1);
  } else {
    console.warn("\u26A0\uFE0F  Non-strict mode: continuing despite missing vars. Build may fail at runtime.\n");
  }
} else {
  console.log("\u2705 Public env check passed:");
  REQUIRED_KEYS.forEach((key) => {
    const prefix = process.env[`EXPO_PUBLIC_${key}`] ? "EXPO_PUBLIC_" : "VITE_";
    console.log(`  - ${prefix}${key}`);
  });
  OPTIONAL_KEYS.forEach((key) => {
    if (resolveKey(key)) {
      const prefix = process.env[`EXPO_PUBLIC_${key}`] ? "EXPO_PUBLIC_" : "VITE_";
      console.log(`  - ${prefix}${key} (optional)`);
    }
  });
}
