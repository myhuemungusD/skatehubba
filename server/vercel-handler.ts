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
 * Lazy initialization. If the cold-start import fails (e.g. missing env
 * vars, transient DB issue), the error is cached and returned on every
 * subsequent request within this function instance.
 *
 * NOTE: ESM `import()` caches module evaluation — if the module-level
 * code in env.ts throws, re-calling `import("./app.ts")` returns the
 * same cached rejection. A new cold start (fresh function instance) is
 * required to retry with updated env vars. Resetting `initPromise`
 * would only cause redundant failed imports, so we cache the result.
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
        // Don't reset initPromise — ESM import() caches module evaluation
        // failures, so retrying would produce the same error. A redeploy
        // (new cold start) is needed after fixing env vars.
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

  // Env vars that always cause a boot crash if missing (see server/config/env.ts)
  const alwaysRequired = ["DATABASE_URL", "SESSION_SECRET", "JWT_SECRET"];
  // Env vars required only when NODE_ENV=production (Vercel sets this automatically)
  const productionRequired = ["MFA_ENCRYPTION_KEY", "IP_HASH_SALT"];

  const isProduction = process.env.NODE_ENV === "production";
  const allRequired = isProduction ? [...alwaysRequired, ...productionRequired] : alwaysRequired;

  const missingVars = allRequired.filter((v) => !process.env[v]?.trim());

  // Check for common misconfigurations that pass the "is set" check but fail Zod
  const invalidVars: string[] = [];
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length < 32) {
    invalidVars.push("SESSION_SECRET (must be at least 32 characters)");
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length < 32) {
    invalidVars.push("JWT_SECRET (must be at least 32 characters)");
  }
  if (
    isProduction &&
    process.env.MFA_ENCRYPTION_KEY &&
    process.env.MFA_ENCRYPTION_KEY.trim().length < 32
  ) {
    invalidVars.push("MFA_ENCRYPTION_KEY (must be at least 32 characters)");
  }
  if (isProduction && process.env.IP_HASH_SALT && process.env.IP_HASH_SALT.trim().length < 16) {
    invalidVars.push("IP_HASH_SALT (must be at least 16 characters)");
  }
  if (isProduction && process.env.REDIS_URL && !process.env.REDIS_URL.startsWith("rediss://")) {
    invalidVars.push("REDIS_URL (must use TLS rediss:// in production)");
  }
  if (
    isProduction &&
    process.env.STRIPE_SECRET_KEY &&
    !process.env.STRIPE_SECRET_KEY.trim().startsWith("sk_")
  ) {
    invalidVars.push("STRIPE_SECRET_KEY (must start with sk_, not pk_)");
  }

  const body = JSON.stringify({
    error: "SERVER_INIT_FAILED",
    message: "Server failed to start. Check environment variables in Vercel dashboard.",
    // Safe to expose: env validation errors contain variable names + rules only, never values.
    // Operational benefit (diagnosing prod without log access) outweighs marginal info leak risk.
    detail: lastInitError?.message,
    missingEnvVars: missingVars.length > 0 ? missingVars : undefined,
    invalidEnvVars: invalidVars.length > 0 ? invalidVars : undefined,
    hint:
      "After fixing env vars, redeploy to force a fresh cold start. " +
      "The /api/health/env diagnostic is only available once the server boots successfully.",
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
