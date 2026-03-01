import { routes, type VercelConfig } from "@vercel/config/v1";

const isProduction = process.env.VERCEL_ENV === "production";

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
    routes.header("/((?!api/).*)", [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ]),
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
