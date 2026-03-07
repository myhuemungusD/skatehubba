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
 * IMPORTANT: This source file lives in server/ and is bundled by esbuild into
 * api/index.js, overwriting the committed placeholder. All @shared/* imports
 * are pre-resolved so Vercel's runtime doesn't need to handle path aliases.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Handler | null = null;
let initPromise: Promise<void> | null = null;
let lastInitError: Error | null = null;

/**
 * Lazy initialization with retry. If the first cold-start import fails
 * (e.g. transient DB / network issue), subsequent requests will retry
 * instead of returning 500 forever.
 */
async function ensureHandler(): Promise<Handler | null> {
  if (handler) return handler;

  if (!initPromise) {
    initPromise = import("./app.ts")
      .then(({ createApp }) => {
        handler = createApp() as unknown as Handler;
        lastInitError = null;
      })
      .catch((error) => {
        lastInitError = error instanceof Error ? error : new Error(String(error));
        console.error("[api/index] Server initialization failed:", lastInitError.message);
        if (lastInitError.stack) {
          console.error("[api/index] Stack trace:", lastInitError.stack);
        }
        // Reset so the next request retries initialization
        initPromise = null;
      });
  }

  await initPromise;
  return handler;
}

export const config = {
  maxDuration: 30,
  memory: 1024,
};

export default async function serverHandler(req: IncomingMessage, res: ServerResponse) {
  const resolved = await ensureHandler();

  if (resolved) {
    return resolved(req, res);
  }

  const requiredVars = ["DATABASE_URL", "SESSION_SECRET", "JWT_SECRET", "MFA_ENCRYPTION_KEY"];
  const missingVars = requiredVars.filter((v) => !process.env[v]?.trim());

  const isDeployed = !!process.env.VERCEL_ENV;

  const body = JSON.stringify({
    error: "SERVER_INIT_FAILED",
    message: "Server failed to start. Check environment variables in Vercel dashboard.",
    detail: isDeployed ? undefined : lastInitError?.message,
    missingEnvVars: missingVars.length > 0 ? missingVars : undefined,
    hint: "Visit /api/env-check for a detailed environment diagnostic.",
  });

  res.writeHead(500, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  res.end(body);
}
