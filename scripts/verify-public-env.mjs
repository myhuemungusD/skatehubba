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
 * Returns { prefix, value } if found with a non-empty value, null otherwise.
 * Trims whitespace so a value of "  " is treated the same as missing.
 */
function resolveKey(key) {
  const expoVal = process.env[`EXPO_PUBLIC_${key}`]?.trim();
  if (expoVal) return { prefix: "EXPO_PUBLIC_", value: expoVal };
  const viteVal = process.env[`VITE_${key}`]?.trim();
  if (viteVal) return { prefix: "VITE_", value: viteVal };
  return null;
}

/**
 * Check if the bare (unprefixed) key is set — used only for diagnostics.
 * These vars are NOT bundled by Vite and will never reach the browser.
 */
function hasUnprefixed(key) {
  return process.env[key] !== undefined;
}

const results = REQUIRED_KEYS.map((key) => ({
  key,
  resolved: resolveKey(key),
  hasUnprefixed: hasUnprefixed(key),
}));

const missing = results.filter((r) => !r.resolved);
const found = results.filter((r) => r.resolved);

if (missing.length > 0) {
  console.error("\n\u274C Missing required public env vars for web build:\n");

  let hasRenameSuggestions = false;

  missing.forEach(({ key, hasUnprefixed: unprefixed }) => {
    if (unprefixed) {
      console.error(`  \u2717 EXPO_PUBLIC_${key}`);
      console.error(
        `    \u2192 Found "${key}" (no prefix). Rename it to "EXPO_PUBLIC_${key}" in Vercel.`
      );
      console.error(
        `    \u2192 Without the prefix, Vite won't bundle this value into the client build.`
      );
      hasRenameSuggestions = true;
    } else {
      console.error(`  \u2717 EXPO_PUBLIC_${key}  (not set)`);
    }
  });

  console.error("");

  if (hasRenameSuggestions) {
    console.error(
      "\u2139\uFE0F  The EXPO_PUBLIC_ prefix is required so Vite includes these values in the"
    );
    console.error(
      "   browser bundle. Variables without it are server-side only and never reach the client."
    );
    console.error("");
  }

  console.error(
    "Set these in Vercel \u2192 Project \u2192 Settings \u2192 Environment Variables.\n"
  );

  if (strict) {
    process.exit(1);
  } else {
    console.warn(
      "\u26A0\uFE0F  Non-strict mode: continuing despite missing vars. Build may fail at runtime.\n"
    );
  }
} else {
  console.log("\u2705 Public env check passed:");
  found.forEach(({ key, resolved }) => {
    console.log(`  \u2713 ${resolved.prefix}${key}`);
  });
  OPTIONAL_KEYS.forEach((key) => {
    const resolved = resolveKey(key);
    if (resolved) {
      console.log(`  \u2713 ${resolved.prefix}${key} (optional)`);
    }
  });
}
