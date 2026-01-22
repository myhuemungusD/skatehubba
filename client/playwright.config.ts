import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "src",
  testMatch: /.*\.spec\.ts/,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
  },
  webServer: {
    command: "pnpm dev -- --host --port 3000",
    port: 3000,
    reuseExistingServer: true,
  },
});
