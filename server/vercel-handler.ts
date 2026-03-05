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
 * api/_handler.mjs with all @shared/* imports pre-resolved. The committed
 * api/index.ts wrapper dynamically imports _handler.mjs at runtime so Vercel
 * detects the function from source while using the pre-bundled code.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Handler | null = null;
let initError: Error | null = null;

try {
  const { createApp } = await import("./app.ts");
  const app = createApp();
  handler = app as unknown as Handler;
} catch (error) {
  initError = error instanceof Error ? error : new Error(String(error));
  console.error("[api/index] Server initialization failed:", initError.message);
  if (initError.stack) {
    console.error("[api/index] Stack trace:", initError.stack);
  }
}

export const config = {
  maxDuration: 30,
  memory: 1024,
};

export default function serverHandler(req: IncomingMessage, res: ServerResponse) {
  if (handler) {
    return handler(req, res);
  }

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
