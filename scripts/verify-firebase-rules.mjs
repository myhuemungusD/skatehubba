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
 * Any --token argument is moved into the child env to avoid exposing it in process listings.
 */
function runFirebase(args) {
  // Copy args so we can safely modify them
  const processedArgs = [...args];

  // Build child environment and ensure we do not accidentally inherit FIREBASE_TOKEN
  const childEnv = {
    ...process.env,
    FIREBASE_TOKEN: undefined,
  };

  // Extract token from CLI args, if present, and move it into the environment
  for (let i = 0; i < processedArgs.length; i += 1) {
    const arg = processedArgs[i];

    // Handle "--token <value>"
    if (arg === "--token" && i + 1 < processedArgs.length) {
      const value = processedArgs[i + 1];
      childEnv.FIREBASE_TOKEN = value;
      processedArgs.splice(i, 2);
      i -= 1;
      continue;
    }

    // Handle "--token=<value>"
    if (arg.startsWith("--token=")) {
      const value = arg.slice("--token=".length);
      childEnv.FIREBASE_TOKEN = value;
      processedArgs.splice(i, 1);
      i -= 1;
    }
  }

  try {
    return execFileSync(
      "npx",
      ["firebase-tools@" + toolsVersion, ...processedArgs],
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
    const safe = (txt) => (txt ? txt.replaceAll(token, "***MASKED***") : txt);

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
      "--token",
      token,
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
      "--token",
      token,
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
