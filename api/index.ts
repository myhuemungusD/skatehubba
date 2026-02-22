/**
 * Vercel Serverless Function — Express API handler
 *
 * Wraps the full Express app so all /api/* routes are served by Vercel's
 * serverless runtime. This eliminates the need for a separate backend
 * server (api.skatehubba.com) — everything deploys together on Vercel.
 *
 * Environment variables (DATABASE_URL, SESSION_SECRET, Firebase keys, etc.)
 * must be configured in the Vercel dashboard under Project Settings → Environment Variables.
 *
 * IMPORTANT: This file catches initialization errors so the serverless
 * function always boots — even if env vars are missing. Without this,
 * a single missing secret crashes the entire module and every /api/*
 * route returns a blank 500 with no diagnostic info.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

let app: ReturnType<typeof import("../server/app.ts").createApp> | null = null;
let initError: Error | null = null;

try {
  const { createApp } = await import("../server/app.ts");
  app = createApp();
} catch (err) {
  initError = err instanceof Error ? err : new Error(String(err));
}

function errorHandler(_req: IncomingMessage, res: ServerResponse) {
  const missing: string[] = [];
  for (const key of ["DATABASE_URL", "SESSION_SECRET", "JWT_SECRET", "MFA_ENCRYPTION_KEY"]) {
    const val = process.env[key];
    if (!val || val.trim() === "") missing.push(key);
  }

  res.writeHead(503, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify(
      {
        error: "SERVER_INIT_FAILED",
        message:
          "The API failed to start. This is almost always caused by missing environment variables in the Vercel dashboard.",
        missingEnvVars: missing.length > 0 ? missing : undefined,
        hint:
          missing.length > 0
            ? `Set these in Vercel → Project → Settings → Environment Variables (enable BOTH Production and Preview checkboxes). Then redeploy.`
            : "All required env vars appear present. Check the initError below for details.",
        initError: initError?.message,
        envCheck: "Visit /api/env-check for a full diagnostic",
        vercelEnv: process.env.VERCEL_ENV ?? "(not set)",
        nodeEnv: process.env.NODE_ENV ?? "(not set)",
      },
      null,
      2
    )
  );
}

export default app ?? errorHandler;
