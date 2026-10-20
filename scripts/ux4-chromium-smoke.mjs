import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const result = {
  recordedAt: new Date().toISOString(),
  platform: process.platform,
  nodeArch: process.arch,
  nodeVersion: process.version,
  executable: chromium.executablePath(),
  launch: "NOT_RUN",
  page: "NOT_RUN",
};
let browser;
let context;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 20000 });
  result.launch = "PASS";
  result.browserVersion = browser.version();
  context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent("<!doctype html><title>UX4 smoke</title><main>UX4 ready</main>");
  if (await page.locator("main").textContent() !== "UX4 ready") throw new Error("PAGE_ASSERTION_FAILED");
  result.page = "PASS";
} catch (error) {
  result.launch = browser ? result.launch : "ENVIRONMENT_BLOCKED";
  result.page = browser ? "FAILED" : "NOT_RUN";
  result.error = String(error).slice(0, 16000);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  const directory = new URL("../artifacts/ux4/", import.meta.url);
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL("chromium-smoke.json", directory), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}
