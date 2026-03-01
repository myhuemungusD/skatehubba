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
const vercelEnv = process.env.VERCEL_ENV || "unknown";
const allowMissing = process.env.ALLOW_MISSING_PUBLIC_ENV === "true";
// Preview/development deploys should warn but NOT fail the build — the env
// vars are often only configured for the production environment.  Failing
// preview deploys blocks PR checks and redeploy-from-dashboard flows.
const isProductionDeploy = vercelEnv === "production";
const strict = isProductionDeploy && !allowMissing;

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
 * Check if the bare (unprefixed) key is set to a non-empty value — used only
 * for diagnostics. These vars are NOT bundled by Vite and will never reach the
 * browser. We require a non-empty value so that `KEY=` (empty string) does not
 * trigger a misleading "rename it" suggestion.
 */
function hasUnprefixed(key) {
  const val = process.env[key];
  return val !== undefined && val.trim().length > 0;
}

/**
 * Mask a value for safe display: show first 4 chars + "..." to confirm it's
 * real and not an empty/placeholder string, without leaking the full secret.
 */
function maskValue(val) {
  if (!val || val.length < 5) return "****";
  return val.substring(0, 4) + "...";
}

/**
 * Check if a server-side env var is set (non-empty).
 */
function isServerVarSet(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

const results = REQUIRED_KEYS.map((key) => ({
  key,
  resolved: resolveKey(key),
  hasUnprefixed: hasUnprefixed(key),
}));

const missing = results.filter((r) => !r.resolved);
const found = results.filter((r) => r.resolved);

// ── Vercel environment context ────────────────────────────────────────────────
// Always print this so build logs make the environment crystal-clear.
console.log("\n── Vercel Build Environment ─────────────────────────────────");
console.log(`  VERCEL:     ${process.env.VERCEL || "(not set)"}`);
console.log(`  VERCEL_ENV: ${process.env.VERCEL_ENV || "(not set)"}`);
console.log(`  NODE_ENV:   ${process.env.NODE_ENV || "(not set)"}`);
console.log(`  strict:     ${strict}  (allowMissing=${allowMissing})`);

if (isVercel) {
  console.log("");
  console.log(`  Vercel is building for the "${vercelEnv}" environment.`);
  if (vercelEnv === "preview") {
    console.log("");
    console.log("  Preview deploys run in non-strict mode — missing public vars");
    console.log("  will produce a warning but will NOT fail the build.");
    console.log("  To supply them, enable the \"Preview\" checkbox in");
    console.log("  Vercel → Project → Settings → Environment Variables.");
  } else if (vercelEnv === "production") {
    console.log("  Ensure each var has the \"Production\" checkbox enabled in Vercel.");
  }
}
console.log("");

if (missing.length > 0) {
  console.error("❌ Missing required public env vars for web build:\n");

  let hasRenameSuggestions = false;

  missing.forEach(({ key, hasUnprefixed: unprefixed }) => {
    if (unprefixed) {
      console.error(`  ✗ EXPO_PUBLIC_${key}`);
      console.error(
        `    → Found "${key}" (no prefix). Rename it to "EXPO_PUBLIC_${key}" in Vercel.`
      );
      console.error(
        `    → Without the prefix, Vite won't bundle this value into the client build.`
      );
      hasRenameSuggestions = true;
    } else {
      console.error(`  ✗ EXPO_PUBLIC_${key}  (not set)`);
    }
  });

  console.error("");

  if (hasRenameSuggestions) {
    console.error(
      "ℹ  The EXPO_PUBLIC_ prefix is required so Vite includes these values in the"
    );
    console.error(
      "   browser bundle. Variables without it are server-side only and never reach the client."
    );
    console.error("");
  }

  console.error(
    "Set these in Vercel → Project → Settings → Environment Variables.\n"
  );

  if (strict) {
    // ── Server-side var check (informational, runs before exit) ──────────────
    if (isVercel) {
      printServerVarChecklist();
    }
    process.exit(1);
  } else {
    const reason = vercelEnv === "preview"
      ? `preview environment ("${vercelEnv}")`
      : allowMissing
        ? "ALLOW_MISSING_PUBLIC_ENV=true"
        : "non-production build";
    console.warn(
      `⚠️  Skipping strict check (${reason}): continuing despite missing vars. Build may fail at runtime.\n`
    );
    // Still print server-var diagnostics when running on Vercel — the server
    // function needs these vars regardless of whether the client-side check is
    // in strict mode.
    if (isVercel) {
      printServerVarChecklist();
    }
  }
} else {
  console.log("✅ Public env check passed:");
  found.forEach(({ key, resolved }) => {
    console.log(`  ✓ ${resolved.prefix}${key} = ${maskValue(resolved.value)}`);
  });
  OPTIONAL_KEYS.forEach((key) => {
    const resolved = resolveKey(key);
    if (resolved) {
      console.log(`  ✓ ${resolved.prefix}${key} (optional) = ${maskValue(resolved.value)}`);
    }
  });

  // ── Server-side var check (informational) ────────────────────────────────
  if (isVercel) {
    printServerVarChecklist();
  }
}

/**
 * Print a checklist of server-side env vars required for the API serverless
 * function. Missing server vars won't fail the BUILD but will crash the API
 * at runtime — every /api request will return 500 and logins/profile creation
 * will fail.
 */
function printServerVarChecklist() {
  const serverRequired = ["DATABASE_URL", "SESSION_SECRET", "JWT_SECRET", "MFA_ENCRYPTION_KEY"];
  // FIREBASE_ADMIN_KEY (full service-account JSON) is the easiest option.
  // Alternatively, set all three individual vars below.
  const firebaseAdmin = ["FIREBASE_ADMIN_KEY", "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];

  const serverMissing = serverRequired.filter((k) => !isServerVarSet(k));
  // Firebase admin is OK if the combined key OR all three individual vars are set.
  const hasAdminKey = isServerVarSet("FIREBASE_ADMIN_KEY");
  const hasIndividualVars = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"].every(isServerVarSet);
  const firebaseAdminOk = hasAdminKey || hasIndividualVars;

  console.log("\n── Server-side vars (required for API serverless function) ──");
  serverRequired.forEach((k) => {
    const set = isServerVarSet(k);
    console.log(`  ${set ? "✓" : "✗"} ${k}${set ? "" : "  ← NOT SET"}`);
  });

  console.log("\n── Firebase Admin vars (required for auth to work) ──────────");
  console.log("  Use FIREBASE_ADMIN_KEY (full JSON) OR all three individual vars:");
  firebaseAdmin.forEach((k) => {
    const set = isServerVarSet(k);
    console.log(`  ${set ? "✓" : "✗"} ${k}${set ? "" : "  ← NOT SET"}`);
  });
  if (firebaseAdminOk) {
    console.log("  → Firebase Admin credentials: OK");
  } else {
    console.log("  → Firebase Admin credentials: MISSING (set FIREBASE_ADMIN_KEY or the three individual vars)");
  }

  if (serverMissing.length > 0) {
    console.error(`
  ⚠️  ${serverMissing.length} required server var(s) missing: ${serverMissing.join(", ")}
     The API serverless function will CRASH on cold start.
     Every /api route (login, profile creation, etc.) will return 500.
     Set these in Vercel → Project → Settings → Environment Variables.`);
  }

  if (!firebaseAdminOk) {
    console.error(`
  ⚠️  Firebase Admin credentials not configured.
     Auth token verification will fail — users cannot log in or create profiles.
     Option A (recommended): Set FIREBASE_ADMIN_KEY to the full service account JSON.
     Option B: Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.
     Get these from Firebase Console → Project Settings → Service Accounts.`);
  }

  console.log("");
}
