import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({ projects: [path.resolve(__dirname, "./tsconfig.json")] }),
  ],
  envDir: path.resolve(__dirname, ".."),
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    sourcemap: false,
  },
  publicDir: "public",
});
