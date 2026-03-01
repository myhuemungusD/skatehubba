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

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Require CRON_SECRET as a bearer token to prevent unauthenticated access.
  // Without this, anyone on the internet can probe which env vars are set
  // and see partial secret values.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization ?? "";
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const queryToken = url.searchParams.get("token");
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : queryToken;

    if (token !== cronSecret) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized. Provide CRON_SECRET as Bearer token or ?token= query param." }));
      return;
    }
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
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}
