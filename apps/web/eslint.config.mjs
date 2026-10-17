import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/mockServiceWorker.js",
    "src/generated/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
