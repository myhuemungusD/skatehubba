import { routes, type VercelConfig } from "@vercel/config/v1";

const isProduction = process.env.VERCEL_ENV === "production";

// ---------------------------------------------------------------------------
// Security headers applied to all static / SPA responses (non-API).
// API routes are handled by the Express middleware (helmet, CORS, CSRF).
// ---------------------------------------------------------------------------
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

// ---------------------------------------------------------------------------
// API-level CDN headers — defence-in-depth on top of Express middleware.
// ---------------------------------------------------------------------------
const apiHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate, proxy-revalidate",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

// Prevent search engines from indexing non-production deployments.
const previewOnlyHeaders = !isProduction
  ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
  : [];

export const config: VercelConfig = {
  installCommand: "pnpm install --frozen-lockfile",
  buildCommand: "node scripts/verify-public-env.mjs && pnpm --filter skatehubba-client build",
  outputDirectory: "client/dist",
  framework: "vite",

  functions: {
    "api/index.ts": {
      maxDuration: 30,
      memory: 1024,
    },
    "api/env-check.ts": {
      maxDuration: 10,
      memory: 256,
    },
  },

  headers: [
    routes.header("/((?!api/).*)", [...securityHeaders, ...previewOnlyHeaders]),
    routes.header("/api/(.*)", [...apiHeaders, ...previewOnlyHeaders]),
    routes.cacheControl("/assets/(.*)", {
      public: true,
      maxAge: "365 days",
      immutable: true,
    }),
  ],

  rewrites: [
    routes.rewrite("/api/env-check", "/api/env-check"),
    routes.rewrite("/api/(.*)", "/api"),
    routes.rewrite("/((?!api/).*)", "/index.html"),
  ],
};

export { securityHeaders, apiHeaders, isProduction };
