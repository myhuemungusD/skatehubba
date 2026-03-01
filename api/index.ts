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
 * IMPORTANT: Uses dynamic import so that env-validation errors in server code
 * don't crash the entire serverless function. When initialization fails, the
 * function returns a structured JSON diagnostic instead of Vercel's opaque 500.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Handler | null = null;
let initError: Error | null = null;

try {
  // Dynamic import is NOT needed here because Vercel compiles the function
  // at build time. But the try-catch around createApp() catches runtime
  // initialization errors (env validation, missing secrets, etc.) that would
  // otherwise produce Vercel's opaque 500 with no JSON body.
  const { createApp } = await import("../server/app.ts");
  const app = createApp();
  handler = app as unknown as Handler;
} catch (error) {
  initError = error instanceof Error ? error : new Error(String(error));
  // Log the actual error so it appears in Vercel runtime logs.
  // Without this, production init failures are completely invisible —
  // the JSON response suppresses the detail and nothing else logs it.
  console.error("[api/index] Server initialization failed:", initError.message);
  if (initError.stack) {
    console.error("[api/index] Stack trace:", initError.stack);
  }
}

export default function serverHandler(req: IncomingMessage, res: ServerResponse) {
  if (handler) {
    return handler(req, res);
  }

  // Initialization failed — return a structured JSON diagnostic so the
  // client-side error normalizer can extract a meaningful message instead
  // of falling back to the generic "Something went wrong" default.
  // Hide error detail in all deployed environments (production AND preview).
  // VERCEL_ENV is set on every Vercel deployment; NODE_ENV alone is insufficient
  // because preview deploys often run with NODE_ENV=development.
  const isDeployed = !!process.env.VERCEL_ENV;
  const body = JSON.stringify({
    error: "SERVER_INIT_FAILED",
    message: "Server failed to start. Check environment variables in Vercel dashboard.",
    detail: isDeployed ? undefined : initError?.message,
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
