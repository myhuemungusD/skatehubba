/**
 * Vercel Serverless Function — API entry point (placeholder)
 *
 * This file is committed to git so Vercel detects it as a serverless function.
 * During the build step, scripts/build-server.mjs overwrites this file with the
 * full esbuild bundle (server/vercel-handler.ts → api/index.js) which resolves
 * all @shared/* path aliases that Vercel's TypeScript compiler cannot handle.
 *
 * If the build step fails to overwrite this file, the placeholder returns a
 * helpful 500 error instead of serving the SPA HTML.
 */

export const config = {
  maxDuration: 30,
  memory: 1024,
};

export default function handler(req, res) {
  const body = JSON.stringify({
    error: "BUILD_INCOMPLETE",
    message:
      "This is the placeholder api/index.js. The esbuild bundle did not overwrite it during the build step.",
    hint: "Check that scripts/build-server.mjs ran successfully and produced api/index.js.",
  });

  res.writeHead(500, {
    "Content-Type": "application/json",
    "Content-Length": String(body.length),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}
