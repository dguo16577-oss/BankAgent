import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  createWriteStream,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webPort = Number(process.env.ASTER_E2E_WEB_PORT ?? 3000);
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535)
  throw new Error("Invalid E2E web port");
const webOrigin = `http://localhost:${webPort}`;
const buildDirectory = process.env.ASTER_E2E_BUILD_DIRECTORY ?? "target";
if (!/^target(?:-[a-z0-9-]+)?$/.test(buildDirectory))
  throw new Error("Invalid isolated build directory");
const backendPort = Number(process.env.ASTER_E2E_BACKEND_PORT ?? 18080);
if (!Number.isInteger(backendPort) || backendPort < 1024 || backendPort > 65535)
  throw new Error("Invalid E2E backend port");
const backendOrigin = `http://localhost:${backendPort}`;
const agentEnabled = process.env.ASTER_E2E_AGENT === "1";
const agentPort = Number(process.env.ASTER_E2E_AGENT_PORT ?? 8001);
if (
  agentEnabled &&
  (!Number.isInteger(agentPort) || agentPort < 1024 || agentPort > 65535)
)
  throw new Error("Invalid E2E agent port");
const agentOrigin = `http://127.0.0.1:${agentPort}`;
const project = "aster-m22-e2e-" + process.pid;
const compose = [
  "compose",
  "-p",
  project,
  "-f",
  join(root, "infra/compose/e2e.compose.yml"),
];
const output = join(root, "test-results/backend-runtime");
mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  NEXT_PUBLIC_API_MODE: "backend",
  NEXT_PUBLIC_BANKING_API_BASE_URL: backendOrigin,
  ASTER_E2E_BACKEND_ORIGIN: backendOrigin,
  DB_HOST: "localhost",
  DB_PORT: "15432",
  DB_NAME: "aster_e2e",
  DB_USER: "aster_e2e",
  DB_PASSWORD: "aster_e2e_only",
  M22_E2E_PROJECT: project,
  ASTER_E2E_WEB_ORIGIN: webOrigin,
  ASTER_AGENT_RUNTIME_URL: agentOrigin,
};
let spring;
let agentRuntime;
let springStarts = 0;
let nextProcess;
let startSpring;
const controlDir = join(output, project);
mkdirSync(controlDir, { recursive: true });
env.ASTER_E2E_CONTROL = controlDir;
env.ASTER_E2E_OWNS_NEXT = "1";
async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await exited;
}
async function startNext() {
  const log = createWriteStream(join(output, "next.log"), { flags: "a" });
  nextProcess = spawn(
    process.execPath,
    [
      require.resolve("../apps/web/node_modules/next/dist/bin/next"),
      "start",
      "--port",
      String(webPort),
    ],
    {
      cwd: join(root, "apps/web"),
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  nextProcess.stdout.pipe(log);
  nextProcess.stderr.pipe(log);
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (nextProcess.exitCode !== null) throw new Error("Next exited");
    try {
      if (
        (
          await fetch(webOrigin, {
            signal: AbortSignal.timeout(3000),
          })
        ).ok
      )
        return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Next readiness timeout");
}
let controlBusy = false;
const controlTimer = setInterval(async () => {
  if (controlBusy) return;
  const file = readdirSync(controlDir).find((n) => n.endsWith(".request.json"));
  if (!file) return;
  controlBusy = true;
  try {
    const { action, at } = JSON.parse(
      readFileSync(join(controlDir, file), "utf8"),
    );
    if (action === "spring-stop") await stopProcess(spring);
    else if (action === "spring-start") await startSpring();
    else if (action === "next-restart") {
      await stopProcess(nextProcess);
      await free(webPort);
      await startNext();
    } else if (action === "database-stop")
      await run("docker", [...compose, "stop", "postgres"]);
    else if (action === "database-start") {
      await run("docker", [...compose, "up", "-d", "--wait"]);
      await ready(backendOrigin + "/actuator/health");
    } else if (action === "schedule-process-due") {
      if (typeof at !== "string" || !Number.isFinite(Date.parse(at)))
        throw new Error("Invalid operator clock");
      await run(join(env.JAVA_HOME, "bin", "java"), [
        "-Xms32m",
        "-Xmx256m",
        "-XX:+UseSerialGC",
        "-XX:ActiveProcessorCount=2",
        "-jar",
        join(
          root,
          `services/banking-core/${buildDirectory}/banking-core-0.1.0-SNAPSHOT.jar`,
        ),
        "--spring.profiles.active=local",
        "--server.port=0",
        "--aster.schedules.run-once=true",
        `--aster.schedules.at=${at}`,
        "--spring.datasource.url=jdbc:postgresql://localhost:15432/aster_e2e",
        "--spring.datasource.username=aster_e2e",
        "--spring.datasource.password=aster_e2e_only",
      ]);
    } else throw new Error("Unsupported test infrastructure action");
    writeFileSync(
      join(controlDir, file.replace(".request.json", ".result.json")),
      JSON.stringify({ ok: true }),
    );
  } catch (e) {
    writeFileSync(
      join(controlDir, file.replace(".request.json", ".result.json")),
      JSON.stringify({ error: e.message }),
    );
  } finally {
    unlinkSync(join(controlDir, file));
    controlBusy = false;
  }
}, 200);
function run(cmd, args, options = {}) {
  return new Promise((done, fail) => {
    const p = spawn(cmd, args, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
      ...options,
    });
    p.on("error", fail);
    p.on("exit", (code) =>
      code === 0 ? done() : fail(new Error(cmd + " exited " + code)),
    );
  });
}
async function free(port) {
  await new Promise((done, fail) => {
    const s = createServer();
    s.once("error", () =>
      fail(
        new Error(
          "Port " +
            port +
            " is occupied; stop the intended workspace service before running real E2E.",
        ),
      ),
    );
    s.listen(port, () => s.close(done));
  });
}
async function ready(url) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (spring?.exitCode !== null && spring?.exitCode !== undefined)
      throw new Error(
        "Spring exited; inspect test-results/backend-runtime/spring.log",
      );
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok && (await r.json()).status === "UP") return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Spring health timeout");
}
let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  clearInterval(controlTimer);
  await stopProcess(nextProcess);
  await stopProcess(agentRuntime);
  if (spring && spring.exitCode === null) {
    spring.kill();
    await new Promise((r) => {
      spring.once("exit", r);
      setTimeout(r, 5000);
    });
  }
  await run("docker", [...compose, "down", "--volumes", "--remove-orphans"]);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void cleanup().finally(() => process.exit(130)));
try {
  for (const port of [webPort, backendPort, 15432]) await free(port);
  if (agentEnabled) await free(agentPort);
  let jdk = env.JAVA_HOME;
  if (
    !jdk ||
    !spawnSync(join(jdk, "bin", "java"), ["-version"], {
      encoding: "utf8",
      windowsHide: true,
    }).stderr?.includes('version "21')
  ) {
    const dir = join(homedir(), ".jdks");
    jdk = existsSync(dir)
      ? readdirSync(dir)
          .filter((n) => n.startsWith("jdk-21"))
          .sort()
          .map((n) => join(dir, n))
          .at(-1)
      : undefined;
  }
  if (!jdk) throw new Error("Set JAVA_HOME to JDK 21.");
  env.JAVA_HOME = jdk;
  env.MAVEN_OPTS =
    "-Xms32m -Xmx384m -XX:+UseSerialGC -XX:ActiveProcessorCount=2";
  if (process.env.M22_SKIP_PACKAGE !== "1") {
    const args = [
      "-B",
      "package",
      "-DskipTests",
      `-Daster.build.directory=${join(root, "services/banking-core", buildDirectory)}`,
    ];
    if (process.platform === "win32")
      await run("cmd.exe", ["/d", "/c", "mvnw.cmd", ...args], {
        cwd: join(root, "services/banking-core"),
      });
    else
      await run("./mvnw", args, { cwd: join(root, "services/banking-core") });
  }
  // Measure the release build, without development StrictMode remount/cancellation noise.
  await run(process.execPath, [
    join(root, "scripts/web-runtime.mjs"),
    "build",
    "backend",
  ]);
  await run("docker", [...compose, "up", "-d", "--wait"]);
  startSpring = async () => {
    const log = createWriteStream(join(output, "spring.log"), {
      flags: springStarts++ ? "a" : "w",
    });
    spring = spawn(
      join(jdk, "bin", "java"),
      [
        "-Xms32m",
        "-Xmx320m",
        "-XX:+UseSerialGC",
        "-XX:ActiveProcessorCount=2",
        "-jar",
        join(
          root,
          `services/banking-core/${buildDirectory}/banking-core-0.1.0-SNAPSHOT.jar`,
        ),
        "--spring.profiles.active=demo,local,e2e",
        `--server.port=${backendPort}`,
        `--aster.web.allowed-origins[0]=${webOrigin}`,
        "--spring.datasource.url=jdbc:postgresql://localhost:15432/aster_e2e",
        "--spring.datasource.username=aster_e2e",
        "--spring.datasource.password=aster_e2e_only",
      ],
      { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    spring.stdout.pipe(log);
    spring.stderr.pipe(log);
    await ready(backendOrigin + "/actuator/health");
  };
  await startSpring();
  if (agentEnabled) {
    const log = createWriteStream(join(output, "agent.log"), { flags: "w" });
    agentRuntime = spawn(
      process.env.ASTER_AGENT_PYTHON ?? "python",
      [
        "-m",
        "uvicorn",
        "app.main:app",
        "--app-dir",
        join(root, "services/agent-runtime"),
        "--host",
        "127.0.0.1",
        "--port",
        String(agentPort),
      ],
      {
        cwd: root,
        env: {
          ...env,
          BANKING_API_BASE_URL: backendOrigin,
          DEEPSEEK_API_KEY: "",
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    agentRuntime.stdout.pipe(log);
    agentRuntime.stderr.pipe(log);
    const deadline = Date.now() + 30_000;
    let healthy = false;
    while (Date.now() < deadline) {
      if (agentRuntime.exitCode !== null)
        throw new Error("Agent runtime exited");
      try {
        healthy = (
          await fetch(`${agentOrigin}/health`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok;
        if (healthy) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!healthy) throw new Error("Agent runtime health timeout");
  }
  await startNext();
  await run(process.execPath, [
    require.resolve("@playwright/test/cli"),
    "test",
    "--config=playwright.backend.config.ts",
    ...process.argv.slice(2),
  ]);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
