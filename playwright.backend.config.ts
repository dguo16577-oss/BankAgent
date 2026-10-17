import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./apps/web/e2e-backend",
  testIgnore: "packaged.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results/real-backend",
  use: {
    ...devices["Desktop Chrome"],
    viewport: {
      width: Number(process.env.ASTER_E2E_WIDTH ?? 1440),
      height: 1000,
    },
    timezoneId: "America/Los_Angeles",
    baseURL: process.env.ASTER_E2E_WEB_ORIGIN ?? "http://localhost:3000",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  webServer: process.env.ASTER_E2E_OWNS_NEXT
    ? undefined
    : {
        command: "node scripts/web-runtime.mjs dev backend",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_API_MODE: "backend",
          NEXT_PUBLIC_BANKING_API_BASE_URL: "http://localhost:18080",
        },
      },
});
