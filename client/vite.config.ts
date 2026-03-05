import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), ["VITE_", "EXPO_PUBLIC_"]);

  // ── Build-tool config (consumed by vite.config.ts only, never bundled into app) ──
  // These intentionally use VITE_ prefix — they configure the build tool, not the app.
  // App-facing env vars MUST use EXPO_PUBLIC_ (see packages/config/src/envContract.ts).
  // ── Defence-in-depth: scrub server secrets from the client bundle ──────────
  // If someone accidentally sets a server secret with EXPO_PUBLIC_ or VITE_
  // prefix, Vite will inline it. This blocklist replaces known dangerous keys
  // with undefined so the value never reaches the browser even if the env var
  // is mis-configured. The verify-public-env.mjs script also blocks the build,
  // but this is belt-and-suspenders.
  const BLOCKED_SECRET_SUFFIXES = [
    "FIREBASE_ADMIN_KEY",
    "FIREBASE_PRIVATE_KEY",
    "DATABASE_URL",
    "SESSION_SECRET",
    "JWT_SECRET",
    "MFA_ENCRYPTION_KEY",
    "CRON_SECRET",
    "REDIS_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ];
  const secretScrubDefines: Record<string, string> = {};
  for (const suffix of BLOCKED_SECRET_SUFFIXES) {
    for (const prefix of ["EXPO_PUBLIC_", "VITE_"]) {
      const key = `${prefix}${suffix}`;
      // Override import.meta.env.KEY to undefined regardless of actual value
      secretScrubDefines[`import.meta.env.${key}`] = "undefined";
    }
  }

  const apiTarget = rootEnv.VITE_API_PROXY_TARGET || "http://localhost:3001";
  const sourcemap = rootEnv.VITE_SOURCEMAP === "true";
  const dropConsole = rootEnv.VITE_DROP_CONSOLE === "true";
  const chunkLimit = Number(rootEnv.VITE_CHUNK_SIZE_WARNING_LIMIT || 900);

  return {
    plugins: [react(), tsconfigPaths({ projects: [path.resolve(__dirname, "./tsconfig.json")] })],
    envDir: path.resolve(__dirname, ".."),
    // Expose both VITE_ and EXPO_PUBLIC_ prefixed env vars for universal compatibility
    envPrefix: ["VITE_", "EXPO_PUBLIC_"],
    server: {
      host: "0.0.0.0",
      port: 3000,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("firebase")) return "firebase";
            if (id.includes("leaflet")) return "leaflet";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("@radix-ui")) return "radix";
            return "vendor";
          },
        },
      },
      chunkSizeWarningLimit: Number.isFinite(chunkLimit) ? chunkLimit : 900,
    },
    define: {
      // Scrub server secrets that were accidentally given a public prefix
      ...secretScrubDefines,
    },
    esbuild: {
      drop: dropConsole ? ["console", "debugger"] : [],
    },
    publicDir: "public",
  };
});
