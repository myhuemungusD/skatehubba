import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [path.resolve(__dirname, "client/tsconfig.json")],
    }),
  ],
  envDir: __dirname,
  envPrefix: ['VITE_', 'EXPO_PUBLIC_'], // Allow both VITE_ and EXPO_PUBLIC_ vars
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  root: "client",
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    sourcemap: false,
  },
  publicDir: "public",
});
