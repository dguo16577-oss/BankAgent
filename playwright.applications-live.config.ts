import { defineConfig } from "@playwright/test";

// Services must already be running. This configuration never starts or resets them.
export default defineConfig({
  testDir: "./apps/web/e2e-applications-live",
  workers: 1,
  timeout: 120_000,
  outputDir: "test-results/applications-live",
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "msedge",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
});
