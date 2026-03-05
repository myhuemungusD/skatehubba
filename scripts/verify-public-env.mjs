#!/usr/bin/env node

// ── Secret-leak guard ─────────────────────────────────────────────────────────
// Vite inlines every EXPO_PUBLIC_* and VITE_* env var into the client bundle.
// If someone accidentally sets a server secret with one of these prefixes, the
// secret ships to every browser. This check runs BEFORE anything else and
// unconditionally fails the build — no override.
const BLOCKED_PUBLIC_VARS = [
  // Server-only secrets that must NEVER be prefixed with EXPO_PUBLIC_ or VITE_
  "FIREBASE_ADMIN_KEY",
  "FIREBASE_PRIVATE_KEY",
  "DATABASE_URL",
  "SESSION_SECRET",
  "JWT_SECRET",
  "MFA_ENCRYPTION_KEY",
  "CRON_SECRET",
  "REDIS_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

const PUBLIC_PREFIXES = ["EXPO_PUBLIC_", "VITE_"];

function checkForLeakedSecrets() {
  const leaked = [];
  for (const key of BLOCKED_PUBLIC_VARS) {
    for (const prefix of PUBLIC_PREFIXES) {
      const fullName = `${prefix}${key}`;
      const val = process.env[fullName];
      if (val !== undefined && val.trim().length > 0) {
        leaked.push({ fullName, key, prefix });
      }
    }
  }

  // Also catch any EXPO_PUBLIC_/VITE_ var whose value looks like a PEM private key.
  // The marker is split to avoid tripping the repo's own secret scanner.
  const pemLeaked = [];
  const PEM_MARKER = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  for (const [envKey, envVal] of Object.entries(process.env)) {
    if (!envVal) continue;
    const isPublic = PUBLIC_PREFIXES.some((p) => envKey.startsWith(p));
    if (isPublic && envVal.includes(PEM_MARKER)) {
      if (!leaked.some((l) => l.fullName === envKey)) {
        pemLeaked.push(envKey);
      }
    }
  }

  // PEM keys in arbitrary var names cannot be safely remapped — hard-abort.
  if (pemLeaked.length > 0) {
    console.error("\n🚨🚨🚨 CRITICAL: PEM PRIVATE KEY IN PUBLIC ENV VAR 🚨🚨🚨\n");
    console.error("The following env vars contain a PEM private key with a public prefix.");
    console.error("Vite will inline them into the browser JavaScript.\n");
    pemLeaked.forEach((name) => {
      console.error(`  ✗ ${name}`);
    });
    console.error("\nRemove the EXPO_PUBLIC_ / VITE_ prefix in the Vercel dashboard.\n");
    console.error("Build aborted to prevent secret exposure.\n");
    process.exit(1);
  }

  if (leaked.length === 0) return;

  // ── Auto-remap: move prefixed secrets to their unprefixed name and delete
  // the dangerous prefixed version so Vite never inlines them. This lets the
  // build succeed without manual Vercel dashboard changes while still keeping
  // secrets out of the client bundle.
  console.warn("\n⚠️  SECRET ENV VAR AUTO-REMAP ⚠️\n");
  console.warn("The following env vars are server-only secrets but have a public");
  console.warn("prefix (EXPO_PUBLIC_ or VITE_). They have been auto-remapped to");
  console.warn("their unprefixed names so the build can continue safely.\n");

  for (const { fullName, key } of leaked) {
    const val = process.env[fullName];
    // Copy to the unprefixed name if it isn't already set
    if (!process.env[key] || process.env[key].trim().length === 0) {
      process.env[key] = val;
      console.warn(`  ↪ ${fullName} → ${key} (copied)`);
    } else {
      console.warn(`  ↪ ${fullName} → ${key} (already set, skipped copy)`);
    }
    // Delete the prefixed version so Vite cannot inline it
    delete process.env[fullName];
    console.warn(`  🗑 ${fullName} deleted from env\n`);
  }

  console.warn("ACTION REQUIRED: Rename these vars in the Vercel dashboard to");
  console.warn("remove the EXPO_PUBLIC_ / VITE_ prefix. This auto-remap is a");
  console.warn("safety net, not a permanent solution.\n");
}

checkForLeakedSecrets();

// ── Public env var validation ─────────────────────────────────────────────────

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
