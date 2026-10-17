import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  outputDir: resolve(__dirname, "../../test-results/mock"),
  fullyParallel: true,
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL,
      },
    },
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "pnpm dev:mock",
    url: baseURL,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_API_MODE: "mock" },
    timeout: 120_000,
  },
});
