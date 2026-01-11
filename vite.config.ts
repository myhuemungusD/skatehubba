import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: __dirname,
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  root: "client",
  build: {
    outDir: "dist", // <--- FIXED: Puts files right where Vercel wants them
    emptyOutDir: true,
    sourcemap: false
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared")
    }
  },
  publicDir: "public"
});
