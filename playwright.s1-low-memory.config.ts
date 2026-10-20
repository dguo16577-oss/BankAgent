import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Each S1.1 batch starts and stops its own mock web server and one browser worker.
export default defineConfig({ ...base, fullyParallel: false, workers: 1 });
