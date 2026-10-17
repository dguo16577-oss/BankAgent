import { defineConfig } from "@playwright/test";
import webConfig from "./apps/web/playwright.config";

export default defineConfig({ ...webConfig, testDir: "./apps/web/e2e" });
