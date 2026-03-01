/**
 * Standalone env diagnostic — zero dependencies, zero imports from server code.
 *
 * This function exists because the main API function (api/index.ts) crashes on
 * cold-start when required env vars are missing, making every /api/* route
 * return 500 — including the /api/health/env diagnostic endpoint.
 *
 * This file has NO imports from server code so it cannot crash due to missing
 * env vars. It reads process.env directly and reports what Vercel is actually
 * providing at runtime.
 *
 * Visit: https://<your-domain>/api/env-check
 * Delete this file once the production env vars are confirmed working.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";

const VARS_TO_CHECK = [
  // Server required — app crashes without these
  { name: "DATABASE_URL", required: true, mask: true },
  { name: "SESSION_SECRET", required: true, mask: true },
  { name: "JWT_SECRET", required: true, mask: true },
  { name: "MFA_ENCRYPTION_KEY", required: true, mask: true },

  // Firebase Admin — auth won't work without at least one option
  { name: "FIREBASE_ADMIN_KEY", required: false, mask: true },
  { name: "FIREBASE_PROJECT_ID", required: false, mask: false },
  { name: "FIREBASE_CLIENT_EMAIL", required: false, mask: false },
  { name: "FIREBASE_PRIVATE_KEY", required: false, mask: true },

  // Firebase Client — baked into build, but useful to confirm
  { name: "EXPO_PUBLIC_FIREBASE_API_KEY", required: false, mask: true },
  { name: "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", required: false, mask: false },
  { name: "EXPO_PUBLIC_FIREBASE_PROJECT_ID", required: false, mask: false },
  { name: "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", required: false, mask: false },
  { name: "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", required: false, mask: false },
  { name: "EXPO_PUBLIC_FIREBASE_APP_ID", required: false, mask: true },

  // Runtime config
  { name: "NODE_ENV", required: false, mask: false },
  { name: "VERCEL_ENV", required: false, mask: false },
  { name: "ALLOWED_ORIGINS", required: false, mask: false },
  { name: "REDIS_URL", required: false, mask: true },
  { name: "CRON_SECRET", required: false, mask: true },
  { name: "APP_CHECK_MODE", required: false, mask: false },
] as const;

function checkVar(name: string, mask: boolean) {
  const raw = process.env[name];
  if (raw === undefined) {
    return { name, status: "missing" as const, length: 0 };
  }
  if (raw.trim() === "") {
    return { name, status: "empty_string" as const, length: 0 };
  }
  const preview = mask ? `${raw.slice(0, 2)}***` : raw;
  return { name, status: "set" as const, length: raw.length, preview };
}

const SECURITY_HEADERS = {
  "Content-Type": "application/json",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/**
 * Constant-time string comparison using HMAC to avoid leaking length info.
 * Uses only the node:crypto built-in — no server code imports.
 */
function timingSafeTokenEqual(a: string, b: string): boolean {
  const key = crypto.randomBytes(32);
  const hmacA = crypto.createHmac("sha256", key).update(a).digest();
  const hmacB = crypto.createHmac("sha256", key).update(b).digest();
  return crypto.timingSafeEqual(hmacA, hmacB);
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Fail closed: reject all requests when CRON_SECRET is not configured.
  // This matches the pattern established in server/middleware/cronAuth.ts
  // and prevents silent auth bypass on misconfigured deployments.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    res.writeHead(403, SECURITY_HEADERS);
    res.end(JSON.stringify({ error: "Forbidden. Env-check is disabled until CRON_SECRET is configured." }));
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !timingSafeTokenEqual(token, cronSecret)) {
    res.writeHead(401, SECURITY_HEADERS);
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const results = VARS_TO_CHECK.map((v) => checkVar(v.name, v.mask));

  const requiredNames: string[] = VARS_TO_CHECK.filter((v) => v.required).map((v) => v.name);
  const failing = results.filter((r) => requiredNames.includes(r.name) && r.status !== "set");

  const payload = {
    timestamp: new Date().toISOString(),
    vercelEnv: process.env.VERCEL_ENV ?? "(not set)",
    nodeEnv: process.env.NODE_ENV ?? "(not set)",
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? "(not set)",
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "(not set)",
    summary: {
      totalChecked: results.length,
      failing: failing.length,
      allRequiredPresent: failing.length === 0,
    },
    // Required vars first — these are the ones that crash the main function
    required: results.filter((r) => requiredNames.includes(r.name)),
    // Optional vars — useful context
    optional: results.filter((r) => !requiredNames.includes(r.name)),
  };

  const status = failing.length === 0 ? 200 : 503;
  res.writeHead(status, SECURITY_HEADERS);
  res.end(JSON.stringify(payload, null, 2));
}
