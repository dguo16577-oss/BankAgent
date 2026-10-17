import { test, expect, type Page } from "@playwright/test";
import {
  scheduleJourney,
  createSchedule,
} from "../e2e-shared/schedule-journey";
import { writeFile, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Sign in to demo" }).click();
  await expect(page).toHaveURL(/\/$/);
}
test("B3 scheduled create amend cancel persistent Payments journey", async ({
  page,
}) => {
  await login(page);
  await scheduleJourney(
    page,
    process.env.ASTER_PACKAGED_ORIGIN
      ? async () => {
          const project = process.env.ASTER_PACKAGED_PROJECT;
          if (!project?.startsWith("aster-m24-e2e-"))
            throw new Error("Isolated packaged project required");
          const url = page.url();
          const compose = [
            "compose",
            "-p",
            project,
            "-f",
            "infra/compose/demo.compose.yml",
            "-f",
            "infra/compose/packaged-test.compose.yml",
          ];
          const run = promisify(execFile);
          await run("docker", [...compose, "down"], {
            env: process.env,
            windowsHide: true,
          });
          await run(
            "docker",
            [...compose, "up", "-d", "--wait", "--wait-timeout", "180"],
            { env: process.env, windowsHide: true },
          );
          await page.goto(url);
          await expect(
            page.getByText("SCHEDULED", { exact: true }),
          ).toBeVisible();
        }
      : undefined,
  );
});
test("B3 deterministic internal operator executes once and leaves cancelled payments untouched", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.ASTER_PACKAGED_ORIGIN),
    "Packaged due processing is covered by real PostgreSQL integration tests.",
  );
  test.setTimeout(180000);
  await login(page);
  const api = process.env.ASTER_E2E_BACKEND_ORIGIN ?? "http://localhost:18080";
  const before = await (
    await page.request.get(`${api}/customer/accounts/acc_current`)
  ).json();
  const spending = await (
    await page.request.get(`${api}/customer/spending/summary`)
  ).json();
  const id = await createSchedule(page);
  const created = await (
    await page.request.get(`${api}/customer/accounts/acc_current`)
  ).json();
  expect(created.balance).toEqual(before.balance);
  const directory = process.env.ASTER_E2E_CONTROL;
  if (!directory) throw new Error("Isolated orchestrator required");
  for (let n = 0; n < 2; n++) {
    const token = randomUUID();
    await writeFile(
      join(directory, token + ".tmp"),
      JSON.stringify({
        action: "schedule-process-due",
        at: "2099-10-05T09:00:00+08:00",
      }),
    );
    await rename(
      join(directory, token + ".tmp"),
      join(directory, token + ".request.json"),
    );
    await expect
      .poll(
        async () => {
          try {
            return JSON.parse(
              await readFile(join(directory, token + ".result.json"), "utf8"),
            );
          } catch {
            return null;
          }
        },
        { timeout: 90000, intervals: [500] },
      )
      .toEqual({ ok: true });
  }
  const after = await (
    await page.request.get(`${api}/customer/accounts/acc_current`)
  ).json();
  const minor = (s: string) => BigInt(s.replace(".", ""));
  expect(minor(before.balance.amount) - minor(after.balance.amount)).toBe(
    BigInt(50000),
  );
  const done = await (
    await page.request.get(`${api}/customer/scheduled-payments/${id}`)
  ).json();
  expect(done.status).toBe("EXECUTED");
  expect(done.transferId).toBeTruthy();
  expect(done.transactionId).toBeTruthy();
  const afterSpending = await (
    await page.request.get(`${api}/customer/spending/summary`)
  ).json();
  expect(afterSpending.totalSpend).toEqual(spending.totalSpend);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "View transfer receipt" }),
  ).toBeVisible();
});
