import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const [command = "dev", explicitMode] = process.argv.slice(2);
const next = require.resolve("../apps/web/node_modules/next/dist/bin/next");
// Use the same env loader as the installed Next runtime, before supplying workspace defaults.
const { loadEnvConfig } = createRequire(next)("@next/env");
loadEnvConfig(
  fileURLToPath(new URL("../apps/web", import.meta.url)),
  command === "dev",
);
const mode = explicitMode ?? process.env.NEXT_PUBLIC_API_MODE ?? "backend";
if (!["backend", "mock"].includes(mode))
  throw new Error("API mode must be backend or mock.");
const env = { ...process.env, NEXT_PUBLIC_API_MODE: mode };
// Only development/type generation may supply a local default. Builds must be explicit.
if (["dev", "typegen"].includes(command))
  env.NEXT_PUBLIC_BANKING_API_BASE_URL ??= "http://localhost:18080";
if (mode === "backend" && !env.NEXT_PUBLIC_BANKING_API_BASE_URL)
  throw new Error(
    "Set NEXT_PUBLIC_BANKING_API_BASE_URL explicitly for build/start.",
  );
console.log(
  `Aster API mode: ${mode}. ${mode === "backend" ? "Start Spring :18080 and PostgreSQL separately." : "Explicit mock development."}`,
);
let entry = next;
if (command === "start") {
  const web = new URL("../apps/web/", import.meta.url);
  const standalone = new URL(
    "../apps/web/.next/standalone/apps/web/",
    import.meta.url,
  );
  const staticSource = new URL(".next/static/", web);
  const publicSource = new URL("public/", web);
  if (
    !existsSync(new URL("server.js", standalone)) ||
    !existsSync(staticSource)
  )
    throw new Error("Build the web app before starting it: pnpm build.");
  mkdirSync(new URL(".next/static/", standalone), { recursive: true });
  cpSync(staticSource, new URL(".next/static/", standalone), {
    recursive: true,
    force: true,
  });
  if (existsSync(publicSource)) {
    mkdirSync(new URL("public/", standalone), { recursive: true });
    cpSync(publicSource, new URL("public/", standalone), {
      recursive: true,
      force: true,
    });
  }
  entry = fileURLToPath(new URL("server.js", standalone));
}
const child = spawn(
  process.execPath,
  [
    entry,
    ...(command === "start" ? [] : [command]),
    ...(command === "dev" ? ["--port", process.env.PORT ?? "3000"] : []),
  ],
  {
    cwd: new URL("../apps/web", import.meta.url),
    env,
    stdio: "inherit",
    windowsHide: true,
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
