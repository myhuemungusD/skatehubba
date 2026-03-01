/**
 * @fileoverview Tests for scripts/verify-public-env.mjs
 *
 * Runs the script as a subprocess so process.exit() calls are safe to test
 * without affecting the test process. Tests validate:
 * - Exit codes (0 on success, 1 in strict mode with missing vars)
 * - Console output for pass, missing, and rename-suggestion cases
 * - Prefix resolution priority (EXPO_PUBLIC_ over VITE_)
 * - Whitespace-only values treated as missing
 * - ALLOW_MISSING_PUBLIC_ENV bypass
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.join(process.cwd(), "scripts", "verify-public-env.mjs");

/** All 6 required Firebase keys with EXPO_PUBLIC_ prefix */
const ALL_REQUIRED_EXPO: NodeJS.ProcessEnv = {
  EXPO_PUBLIC_FIREBASE_API_KEY: "api-key",
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "test.appspot.com",
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  EXPO_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abc",
};

/** All 6 required Firebase keys with VITE_ prefix */
const ALL_REQUIRED_VITE: NodeJS.ProcessEnv = {
  VITE_FIREBASE_API_KEY: "api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "test-project",
  VITE_FIREBASE_STORAGE_BUCKET: "test.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_APP_ID: "1:123456789:web:abc",
};

/**
 * Run the verify script with the given env vars merged into a clean environment.
 * Returns stdout, stderr, combined (stdout+stderr), and the exit code.
 *
 * NOTE: `combined` exists because console.warn may route to stdout or stderr
 * depending on the Node.js version. Use `combined` for assertions about
 * warn-level messages to keep tests resilient across Node 22 → 24+.
 */
function run(env: NodeJS.ProcessEnv): {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number;
} {
  // Build a minimal env — don't inherit test runner's VITEST/NODE_ENV so
  // the script doesn't accidentally see test-mode env from the parent process.
  const scriptEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    ...env,
  };

  const result = spawnSync("node", [SCRIPT], {
    env: scriptEnv,
    encoding: "utf-8",
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    stdout,
    stderr,
    combined: stdout + stderr,
    exitCode: result.status ?? 1,
  };
}

// =============================================================================
// Success paths
// =============================================================================

describe("verify-public-env — success paths", () => {
  it("exits 0 when all required vars are set with EXPO_PUBLIC_ prefix", () => {
    const { exitCode, stdout } = run(ALL_REQUIRED_EXPO);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("✅ Public env check passed");
  });

  it("exits 0 when all required vars are set with VITE_ prefix", () => {
    const { exitCode, stdout } = run(ALL_REQUIRED_VITE);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("✅ Public env check passed");
  });

  it("lists each found key in success output", () => {
    const { stdout } = run(ALL_REQUIRED_EXPO);
    expect(stdout).toContain("EXPO_PUBLIC_FIREBASE_API_KEY");
    expect(stdout).toContain("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
    expect(stdout).toContain("EXPO_PUBLIC_FIREBASE_APP_ID");
  });

  it("prefers EXPO_PUBLIC_ over VITE_ when both are set", () => {
    const { stdout } = run({ ...ALL_REQUIRED_EXPO, ...ALL_REQUIRED_VITE });
    // All 6 lines should show EXPO_PUBLIC_ prefix
    const lines = stdout.split("\n").filter((l) => l.includes("FIREBASE_"));
    expect(lines.every((l) => l.includes("EXPO_PUBLIC_"))).toBe(true);
  });

  it("shows optional key when set", () => {
    const { stdout } = run({
      ...ALL_REQUIRED_EXPO,
      EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-XXXX",
    });
    expect(stdout).toContain("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID");
    expect(stdout).toContain("(optional)");
  });

  it("does not show optional key when not set", () => {
    const { stdout } = run(ALL_REQUIRED_EXPO);
    expect(stdout).not.toContain("MEASUREMENT_ID");
  });
});

// =============================================================================
// Missing vars — non-strict mode (no VERCEL=1, no NODE_ENV=production)
// =============================================================================

describe("verify-public-env — missing vars, non-strict mode", () => {
  it("exits 0 (non-strict) when vars are missing and VERCEL is not set", () => {
    const { exitCode } = run({});
    expect(exitCode).toBe(0);
  });

  it("prints error message listing missing keys", () => {
    const { stderr } = run({});
    expect(stderr).toContain("❌ Missing required public env vars");
    expect(stderr).toContain("EXPO_PUBLIC_FIREBASE_API_KEY");
  });

  it("prints non-strict warning", () => {
    const { combined } = run({});
    expect(combined).toContain("Non-strict mode");
  });
});

// =============================================================================
// Strict mode (VERCEL=1 or NODE_ENV=production)
// =============================================================================

describe("verify-public-env — strict mode", () => {
  it("exits 1 when VERCEL=1 and vars are missing", () => {
    const { exitCode } = run({ VERCEL: "1" });
    expect(exitCode).toBe(1);
  });

  it("exits 1 when NODE_ENV=production and vars are missing", () => {
    const { exitCode } = run({ NODE_ENV: "production" });
    expect(exitCode).toBe(1);
  });

  it("exits 0 when ALLOW_MISSING_PUBLIC_ENV=true bypasses VERCEL strict mode", () => {
    const { exitCode } = run({ VERCEL: "1", ALLOW_MISSING_PUBLIC_ENV: "true" });
    expect(exitCode).toBe(0);
  });

  it("still prints server-var checklist in non-strict Vercel mode (ALLOW_MISSING_PUBLIC_ENV=true)", () => {
    // Bug fix: the non-strict path was silently skipping printServerVarChecklist()
    // even when isVercel=true. Server vars are needed regardless of client strictness.
    const { stdout } = run({ VERCEL: "1", ALLOW_MISSING_PUBLIC_ENV: "true" });
    expect(stdout).toContain("── Server-side vars");
  });

  it("exits 0 in strict mode when all vars are correctly set", () => {
    const { exitCode } = run({ VERCEL: "1", ...ALL_REQUIRED_EXPO });
    expect(exitCode).toBe(0);
  });
});

// =============================================================================
// Rename suggestions — unprefixed vars detected
// =============================================================================

describe("verify-public-env — rename suggestions", () => {
  it("shows rename suggestion when var is set without prefix", () => {
    const { stderr } = run({ FIREBASE_API_KEY: "abc" });
    expect(stderr).toContain('Found "FIREBASE_API_KEY" (no prefix)');
    expect(stderr).toContain('Rename it to "EXPO_PUBLIC_FIREBASE_API_KEY"');
  });

  it("shows the Vite bundling explanation when rename suggestion is present", () => {
    const { stderr } = run({ FIREBASE_API_KEY: "abc" });
    expect(stderr).toContain("Vite won't bundle this value into the client build");
  });

  it("shows (not set) for vars that have no form at all", () => {
    // Only set ONE key without prefix — the other 5 have nothing
    const { stderr } = run({ FIREBASE_API_KEY: "abc" });
    expect(stderr).toContain("(not set)");
  });

  it("still exits 1 in strict mode even with rename suggestion present", () => {
    const { exitCode } = run({ VERCEL: "1", FIREBASE_API_KEY: "abc" });
    expect(exitCode).toBe(1);
  });

  it("does NOT show rename suggestion when bare var is set to empty string", () => {
    // Bug fix: hasUnprefixed() used to return true for KEY="" because it only
    // checked !== undefined. Now it requires a non-empty trimmed value.
    const { stderr } = run({ FIREBASE_API_KEY: "" });
    expect(stderr).not.toContain('Found "FIREBASE_API_KEY" (no prefix)');
    // Should appear as (not set) since both the prefixed and bare variants are empty.
    expect(stderr).toContain("(not set)");
  });
});

// =============================================================================
// Whitespace / empty value edge cases
// =============================================================================

describe("verify-public-env — whitespace and empty values", () => {
  it("treats whitespace-only EXPO_PUBLIC_ value as missing", () => {
    const { stderr } = run({ ...ALL_REQUIRED_EXPO, EXPO_PUBLIC_FIREBASE_API_KEY: "   " });
    expect(stderr).toContain("EXPO_PUBLIC_FIREBASE_API_KEY");
  });

  it("treats empty string EXPO_PUBLIC_ value as missing", () => {
    const { stderr } = run({ ...ALL_REQUIRED_EXPO, EXPO_PUBLIC_FIREBASE_API_KEY: "" });
    expect(stderr).toContain("EXPO_PUBLIC_FIREBASE_API_KEY");
  });

  it("treats whitespace-only VITE_ value as missing and falls through to (not set)", () => {
    const { stderr } = run({ ...ALL_REQUIRED_EXPO, EXPO_PUBLIC_FIREBASE_API_KEY: "   " });
    // No unprefixed key set either, so should show (not set), not a rename suggestion
    expect(stderr).toContain("(not set)");
  });
});

// =============================================================================
// Server-side checklist — MFA_ENCRYPTION_KEY and FIREBASE_ADMIN_KEY (Vercel mode)
// =============================================================================

describe("verify-public-env — server var checklist (Vercel mode)", () => {
  it("lists MFA_ENCRYPTION_KEY in server-side vars section", () => {
    const { stdout } = run({ VERCEL: "1", ALLOW_MISSING_PUBLIC_ENV: "true" });
    expect(stdout).toContain("MFA_ENCRYPTION_KEY");
  });

  it("marks MFA_ENCRYPTION_KEY as NOT SET when absent", () => {
    const { stdout } = run({ VERCEL: "1", ALLOW_MISSING_PUBLIC_ENV: "true" });
    expect(stdout).toContain("MFA_ENCRYPTION_KEY  ← NOT SET");
  });

  it("marks MFA_ENCRYPTION_KEY as set when present", () => {
    const { stdout } = run({
      VERCEL: "1",
      ALLOW_MISSING_PUBLIC_ENV: "true",
      DATABASE_URL: "postgresql://host/db",
      SESSION_SECRET: "s".repeat(32),
      JWT_SECRET: "j".repeat(32),
      MFA_ENCRYPTION_KEY: "m".repeat(32),
    });
    // Should show checkmark (✓) and no "← NOT SET" for MFA_ENCRYPTION_KEY
    const lines = stdout.split("\n").filter((l) => l.includes("MFA_ENCRYPTION_KEY"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("✓");
    expect(lines[0]).not.toContain("← NOT SET");
  });

  it("shows Firebase Admin credentials OK when FIREBASE_ADMIN_KEY is set", () => {
    const { stdout } = run({
      VERCEL: "1",
      ALLOW_MISSING_PUBLIC_ENV: "true",
      FIREBASE_ADMIN_KEY: '{"type":"service_account","project_id":"test"}',
    });
    expect(stdout).toContain("Firebase Admin credentials: OK");
  });

  it("shows Firebase Admin credentials MISSING when neither FIREBASE_ADMIN_KEY nor individual vars are set", () => {
    const { stdout } = run({ VERCEL: "1", ALLOW_MISSING_PUBLIC_ENV: "true" });
    expect(stdout).toContain("Firebase Admin credentials: MISSING");
  });

  it("shows Firebase Admin credentials OK when all three individual vars are set", () => {
    const { stdout } = run({
      VERCEL: "1",
      ALLOW_MISSING_PUBLIC_ENV: "true",
      FIREBASE_PROJECT_ID: "my-project",
      FIREBASE_CLIENT_EMAIL: "svc@my-project.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: "test-private-key-placeholder-value",
    });
    expect(stdout).toContain("Firebase Admin credentials: OK");
  });

  it("emits a warning when Firebase Admin credentials are not configured", () => {
    const { combined } = run({ VERCEL: "1", ALLOW_MISSING_PUBLIC_ENV: "true" });
    expect(combined).toContain("Firebase Admin credentials not configured");
  });

  it("does not emit Firebase Admin warning when FIREBASE_ADMIN_KEY is set", () => {
    const { combined } = run({
      VERCEL: "1",
      ALLOW_MISSING_PUBLIC_ENV: "true",
      FIREBASE_ADMIN_KEY: '{"type":"service_account"}',
    });
    expect(combined).not.toContain("Firebase Admin credentials not configured");
  });
});
