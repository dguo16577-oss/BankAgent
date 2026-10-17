import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
const execute = promisify(execFile);
const project = process.env.ASTER_PACKAGED_PROJECT;
const env = { ...process.env };
const origin = process.env.ASTER_PACKAGED_ORIGIN;
const base = [
  "compose",
  "-p",
  project ?? "invalid",
  "-f",
  "infra/compose/demo.compose.yml",
  "-f",
  "infra/compose/packaged-test.compose.yml",
];
async function docker(args: string[]) {
  if (!project?.startsWith("aster-m24-e2e-"))
    throw new Error("Isolated packaged runner required");
  return (
    await execute("docker", args, {
      env,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    })
  ).stdout.trim();
}
const compose = (...args: string[]) => docker([...base, ...args]);
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Sign in to demo" }).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app/overview");
  await expect(page.getByTestId("total-balance")).toHaveText("¥34,953.68");
}
async function retained(page: Page) {
  // Uses the same browser cookie: this also proves JDBC session persistence.
  await page.goto("/app/overview");
  await expect(page.getByTestId("total-balance")).toHaveText("¥34,953.68");
  await expect(page.getByText("¥19,320.00", { exact: true })).toBeVisible();
  await expect(page.getByText("¥4,968.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Netflix", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Active", { exact: true })).toHaveCount(2);
  await page.goto("/app/accounts/acc_current");
  await expect(page.getByText("¥22,342.31", { exact: true })).toBeVisible();
  await expect(page.getByText("¥22,310.31", { exact: true })).toBeVisible();
  await expect(page.getByText("¥32.00", { exact: true })).toBeVisible();
}

test("packaged deployment durability, backup/restore, outage recovery and production isolation", async ({
  page,
  context,
}) => {
  test.setTimeout(720_000);
  await login(page);
  const response = await page.goto("/app/overview");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("connect-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["strict-transport-security"]).toBeUndefined();
  expect(
    (await context.request.get(origin + "/actuator/health")).status(),
  ).toBe(404);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "SESSION")).toMatchObject({
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
    path: "/",
  });
  expect(cookies.find((c) => c.name === "XSRF-TOKEN")).toMatchObject({
    httpOnly: false,
    secure: false,
  });
  expect(
    (await context.request.get(origin + "/customer/accounts")).headers()[
      "cache-control"
    ],
  ).toContain("no-store");
  expect(
    (
      await context.request.post(origin + "/customer/transfer-intents", {
        data: {},
      })
    ).status(),
  ).toBe(403);
  for (const service of ["web", "banking-core"]) {
    const id = await compose("ps", "-q", service);
    const user = await docker(["inspect", "--format", "{{.Config.User}}", id]);
    expect(["", "0", "root"]).not.toContain(user);
    expect(
      await docker([
        "inspect",
        "--format",
        "{{json .HostConfig.PortBindings}}",
        id,
      ]),
    ).toMatch(/^({}|null)$/);
  }
  const pg = await compose("ps", "-q", "postgres");
  expect(
    await docker([
      "inspect",
      "--format",
      "{{json .HostConfig.PortBindings}}",
      pg,
    ]),
  ).toMatch(/^({}|null)$/);
  await test.step("service restart retains financial state and session", async () => {
    await compose("restart", "web", "banking-core", "reverse-proxy");
    await compose("up", "-d", "--wait", "--wait-timeout", "180");
    await retained(page);
  });
  await test.step("whole stack restart and down/up retain the named volume", async () => {
    await compose("restart");
    await compose("up", "-d", "--wait", "--wait-timeout", "180");
    await retained(page);
    await compose("down");
    await compose("up", "-d", "--wait", "--wait-timeout", "180");
    await retained(page);
  });
  await test.step("backend and database outages recover without mock fallback", async () => {
    await compose("stop", "banking-core");
    expect((await context.request.get(origin + "/")).status()).toBe(200);
    expect([502, 504]).toContain(
      (await context.request.get(origin + "/customer/accounts")).status(),
    );
    await page.goto("/app/overview");
    await expect(
      page.getByRole("button", { name: /retry/i }).first(),
    ).toBeVisible();
    await compose("up", "-d", "--wait", "--wait-timeout", "180");
    await retained(page);
    await compose("stop", "postgres");
    const health = await compose(
      "exec",
      "-T",
      "banking-core",
      "curl",
      "-s",
      "-w",
      "%{http_code}",
      "http://localhost:8080/actuator/health",
    );
    expect(health).toContain("DOWN");
    expect(health).toContain("503");
    expect(
      (await context.request.get(origin + "/customer/accounts")).status(),
    ).toBe(500);
    await page.goto("/app/overview");
    await expect(
      page.getByRole("button", { name: /retry/i }).first(),
    ).toBeVisible();
    await compose("up", "-d", "--wait", "--wait-timeout", "180");
    await retained(page);
    expect(
      await page.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
    ).toBe(0);
  });
  await test.step("dump on host restores into a fresh database", async () => {
    await compose("stop", "banking-core");
    await compose(
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "-U",
      "asterbank",
      "-d",
      "asterbank",
      "-Fc",
      "-f",
      "/tmp/m24.dump",
    );
    await mkdir("test-results/packaged-evidence", { recursive: true });
    await compose(
      "cp",
      "postgres:/tmp/m24.dump",
      "test-results/packaged-evidence/m24.dump",
    );
    await compose(
      "exec",
      "-T",
      "postgres",
      "createdb",
      "-U",
      "asterbank",
      "aster_restore",
    );
    await compose(
      "cp",
      "test-results/packaged-evidence/m24.dump",
      "postgres:/tmp/restore.dump",
    );
    await compose(
      "exec",
      "-T",
      "postgres",
      "pg_restore",
      "-U",
      "asterbank",
      "-d",
      "aster_restore",
      "--exit-on-error",
      "--no-owner",
      "/tmp/restore.dump",
    );
    env.DB_NAME = "aster_restore";
    await compose("up", "-d", "--wait", "--wait-timeout", "180");
    await retained(page);
  });
  await test.step("production starts without seeds, emits Secure CSRF and rejects missing inputs", async () => {
    await compose(
      "exec",
      "-T",
      "postgres",
      "createdb",
      "-U",
      "asterbank",
      "aster_prod",
    );
    const name = `${project}-prod`;
    try {
      await compose(
        "run",
        "--no-deps",
        "-d",
        "--name",
        name,
        "-e",
        "SPRING_PROFILES_ACTIVE=prod",
        "-e",
        "DB_NAME=aster_prod",
        "banking-core",
      );
      await expect
        .poll(
          async () => {
            try {
              return await docker([
                "exec",
                name,
                "curl",
                "--fail",
                "-s",
                "http://localhost:8080/actuator/health",
              ]);
            } catch {
              return "starting";
            }
          },
          { timeout: 120_000, intervals: [1000] },
        )
        .toContain("UP");
      const count = await compose(
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "asterbank",
        "-d",
        "aster_prod",
        "-At",
        "-c",
        "select count(*) from customers;",
      );
      expect(count).toBe("0");
      const csrfHeaders = await docker([
        "exec",
        name,
        "curl",
        "-s",
        "-D",
        "-",
        "http://localhost:8080/customer/session",
      ]);
      expect(csrfHeaders).toMatch(/XSRF-TOKEN=.*Secure.*SameSite=Lax/i);
      // Explicit test provisioning after proving production startup seeded zero customers.
      const identityFixture = await compose(
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "asterbank",
        "-d",
        "asterbank",
        "--data-only",
        "--inserts",
        "-t",
        "customers",
        "-t",
        "customer_credentials",
        "-t",
        "customer_phone_bindings",
      );
      // psql backslash guard commands emitted by pg_dump are not SQL for -c.
      const identitySql = identityFixture
        .split("\n")
        .filter((line) => !line.startsWith("\\"))
        .join("\n");
      await compose(
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "asterbank",
        "-d",
        "aster_prod",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        identitySql,
      );
      const jar = "/tmp/b4-production-test-cookies";
      const prodGet = (path: string) =>
        docker([
          "exec",
          name,
          "curl",
          "-s",
          "-D",
          "-",
          "-b",
          jar,
          "-c",
          jar,
          `http://localhost:8080${path}`,
        ]);
      const token = (headers: string) => {
        const match = headers.match(/XSRF-TOKEN=([^;\r\n]+)/);
        if (!match) throw new Error("Production CSRF bootstrap failed");
        return match[1];
      };
      let csrf = token(await prodGet("/customer/session"));
      const prodPost = (path: string, body: unknown) =>
        docker([
          "exec",
          name,
          "curl",
          "-s",
          "-D",
          "-",
          "-b",
          jar,
          "-c",
          jar,
          "-H",
          "Content-Type: application/json",
          "-H",
          `X-XSRF-TOKEN: ${csrf}`,
          "--data",
          JSON.stringify(body),
          `http://localhost:8080${path}`,
        ]);
      expect(
        await prodPost("/customer/auth/login", {
          email: "alex@aster.local",
          password: "demo-password",
        }),
      ).toContain('"authenticated":true');
      csrf = token(await prodGet("/customer/session"));
      const profile = await prodGet("/customer/security/profile");
      expect(profile).toContain('"demoSmsAvailable":false');
      expect(await prodGet("/customer/demo/sms/unknown")).toContain(
        "DEMO_SMS_UNAVAILABLE",
      );
      const blocked = await prodPost("/customer/auth/step-up-challenges", {
        actionType: "TRANSFER_EXECUTE",
        resourceType: "TRANSFER_INTENT",
        resourceId: "production-test-intent",
        resourceHash: "production-test-hash",
      });
      expect(blocked).toContain("503");
      expect(blocked).toContain("VERIFICATION_UNAVAILABLE");
      expect(
        await compose(
          "exec",
          "-T",
          "postgres",
          "psql",
          "-U",
          "asterbank",
          "-d",
          "aster_prod",
          "-At",
          "-c",
          "select count(*) from demo_sms_outbox;",
        ),
      ).toBe("0");
      await writeFile(
        "test-results/packaged-evidence/prod.json",
        JSON.stringify({
          healthy: true,
          customerCount: 0,
          secureCsrf: true,
          noDemoProfiles: true,
          authenticatedDemoInboxDisabled: true,
          smsRequiredActionFailsClosed: true,
        }),
      );
    } finally {
      await docker(["rm", "-f", name]);
    }
    await expect(
      compose(
        "run",
        "--rm",
        "--no-deps",
        "-e",
        "SPRING_PROFILES_ACTIVE=prod",
        "-e",
        "DB_PASSWORD=",
        "banking-core",
      ),
    ).rejects.toThrow();
  });
  // Restore the runner's database after the restore drill. Later tests restart
  // the stack with the original environment and must not switch databases.
  env.DB_NAME = process.env.DB_NAME;
  await compose("up", "-d", "--wait", "--wait-timeout", "180");
  await retained(page);
  const logs = await compose("logs", "--no-color");
  for (const secret of ["demo-password", "246810", env.DB_PASSWORD!])
    expect(logs).not.toContain(secret);
  expect(logs).not.toMatch(/SESSION=[A-Za-z0-9+/]{12}/);
  await writeFile(
    "test-results/packaged-evidence/operations.json",
    JSON.stringify({
      serviceRestart: true,
      stackRestart: true,
      downUp: true,
      restoredDatabase: true,
      sessionSurvived: true,
      backendOutage: true,
      databaseOutage: true,
      secretLogLeak: false,
    }),
  );
});
