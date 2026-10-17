import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const project = `aster-m24-e2e-${process.pid}`;
const env = {
  ...process.env,
  DB_NAME: "asterbank",
  DB_USER: "asterbank",
  DB_PASSWORD: randomBytes(24).toString("hex"),
  DEMO_PORT: process.env.DEMO_PORT ?? "8088",
  ASTER_PACKAGED_PROJECT: project,
};
env.ASTER_PACKAGED_ORIGIN = `http://localhost:${env.DEMO_PORT}`;
const compose = [
  "compose",
  "-p",
  project,
  "-f",
  "infra/compose/demo.compose.yml",
  "-f",
  "infra/compose/packaged-test.compose.yml",
];
function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      windowsHide: true,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    if (capture)
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (data) => (output += data));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
await mkdir("test-results/packaged-evidence", { recursive: true });
try {
  if (!process.env.M24_SKIP_BUILD) await run("docker", [...compose, "build"]);
  await run("docker", [
    ...compose,
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "180",
  ]);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(env.ASTER_PACKAGED_ORIGIN, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error("Proxy is not ready");
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  await writeFile(
    "test-results/packaged-evidence/services.json",
    await run("docker", [...compose, "ps", "--format", "json"], true),
  );
  await run(process.execPath, [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config=playwright.packaged.config.ts",
  ]);
} finally {
  await writeFile(
    "test-results/packaged-evidence/container.log",
    await run("docker", [...compose, "logs", "--no-color"], true),
  );
  await run("docker", [...compose, "down", "--volumes", "--remove-orphans"]);
}
