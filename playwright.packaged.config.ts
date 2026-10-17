import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./apps/web/e2e-backend",
  testMatch: [
    "applications.spec.ts",
    "banking.spec.ts",
    "packaged.spec.ts",
    "recipients.spec.ts",
    "schedules.spec.ts",
  ],
  grep: /persisted application journey|anonymous Public, real login|packaged deployment|B2 recipient|B3 scheduled create/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 360_000,
  expect: { timeout: 20_000 },
  outputDir: "test-results/packaged",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    baseURL: process.env.ASTER_PACKAGED_ORIGIN ?? "http://localhost:8088",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
});
