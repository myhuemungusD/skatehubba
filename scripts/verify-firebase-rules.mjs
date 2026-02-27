#!/usr/bin/env node
/* eslint-disable no-console */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Firebase Rules Verification (Enterprise)
 *
 * Validates Firebase rules using dry-run deployment.
 * This checks syntax and compatibility without actually deploying.
 *
 * Env:
 *  - FIREBASE_PROJECT_ID (required)
 *  - FIREBASE_TOKEN (required) - CI token; never printed
 *
 * Optional:
 *  - FIREBASE_TOOLS_VERSION (default: "latest")
 *  - FIREBASE_RULES_STRICT (default: "true") - fail if rules files missing
 *
 * Usage:
 *  node scripts/verify-firebase-rules.mjs
 */

const projectId = process.env.FIREBASE_PROJECT_ID;
const token = process.env.FIREBASE_TOKEN;
const useNpx = (process.env.FIREBASE_USE_NPX ?? "false").toLowerCase() === "true";
const toolsVersion = process.env.FIREBASE_TOOLS_VERSION ?? "latest";
const strict = (process.env.FIREBASE_RULES_STRICT ?? "true").toLowerCase() === "true";

if (!projectId) {
  console.error("❌ Missing FIREBASE_PROJECT_ID.");
  process.exit(1);
}
if (!token) {
  console.error("❌ Missing FIREBASE_TOKEN.");
  process.exit(1);
}

const repoRoot = process.cwd();
const firestoreRulesPath = path.join(repoRoot, "firestore.rules");
const storageRulesPath = path.join(repoRoot, "storage.rules");

const hasFirestoreRules = existsSync(firestoreRulesPath);
const hasStorageRules = existsSync(storageRulesPath);

if (strict && !hasFirestoreRules) {
  console.error("❌ firestore.rules not found at repo root.");
  process.exit(1);
}
if (strict && !hasStorageRules) {
  console.error("❌ storage.rules not found at repo root.");
  process.exit(1);
}

const normalize = (s) => s.replace(/\r\n/g, "\n").trim() + "\n";

const readLocal = (filePath) => normalize(readFileSync(filePath, "utf8"));

/**
 * Executes firebase-tools via npx without invoking a shell.
 * Token is passed exclusively via environment variable - never as a CLI argument.
 */
function runFirebase(args) {
  // Minimal child environment: only what firebase-tools needs
  const childEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: process.env.NODE_ENV,
    FIREBASE_TOKEN: token,
    npm_config_cache: process.env.npm_config_cache,
  };

  // Prefer the standalone `firebase` binary (installed via curl -sL https://firebase.tools | bash)
  // Fall back to npx for local dev if FIREBASE_USE_NPX=true
  const cmd = useNpx ? "npx" : "firebase";
  const cmdArgs = useNpx ? ["firebase-tools@" + toolsVersion, ...args] : args;

  try {
    return execFileSync(
      cmd,
      cmdArgs,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: childEnv,
      }
    );
  } catch (err) {
    // Sanitize any accidental token echo from stderr/stdout
    const stdout = typeof err?.stdout === "string" ? err.stdout : "";
    const stderr = typeof err?.stderr === "string" ? err.stderr : "";
    const msg = typeof err?.message === "string" ? err.message : "firebase-tools failed";
    const safe = (txt) => (token && txt ? txt.replaceAll(token, "***MASKED***") : txt);

    console.error("❌ firebase-tools command failed.");
    console.error(safe(msg));
    if (stdout) console.error(safe(stdout));
    if (stderr) console.error(safe(stderr));

    process.exit(1);
  }
}

function validateRules() {
  console.log(`🔍 Validate rules (dry-run) for project: ${projectId}`);

  if (hasFirestoreRules) {
    console.log("  • Firestore rules: validating…");
    runFirebase([
      "deploy",
      "--only",
      "firestore:rules",
      "--project",
      projectId,
      "--non-interactive",
      "--dry-run",
    ]);
    console.log("  ✅ Firestore rules validate (dry-run) OK");
  } else {
    console.log("  ⚠️  Firestore rules missing; skipped");
  }

  if (hasStorageRules) {
    console.log("  • Storage rules: validating…");
    runFirebase([
      "deploy",
      "--only",
      "storage",
      "--project",
      projectId,
      "--non-interactive",
      "--dry-run",
    ]);
    console.log("  ✅ Storage rules validate (dry-run) OK");
  } else {
    console.log("  ⚠️  Storage rules missing; skipped");
  }
}

// Validate rules (dry-run deployment)
validateRules();

console.log("✅ Firebase rules verification complete.");
