import { completeVerification } from "../e2e-shared/verification";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const api = process.env.ASTER_E2E_BACKEND_ORIGIN ?? "http://localhost:18080";
test.describe.configure({ mode: "serial" });
async function control(action: string) {
  const directory = process.env.ASTER_E2E_CONTROL;
  if (!directory)
    throw new Error("Requires the isolated real-backend orchestrator");
  const id = randomUUID();
  await writeFile(join(directory, id + ".tmp"), JSON.stringify({ action }));
  await rename(
    join(directory, id + ".tmp"),
    join(directory, id + ".request.json"),
  );
  await expect
    .poll(
      async () => {
        try {
          return JSON.parse(
            await readFile(join(directory, id + ".result.json"), "utf8"),
          );
        } catch {
          return null;
        }
      },
      { timeout: 150_000, intervals: [250, 500] },
    )
    .toEqual({ ok: true });
}
function sql(statement: string) {
  const project = process.env.M22_E2E_PROJECT;
  if (!project?.startsWith("aster-m22-e2e-"))
    throw new Error("Refusing non-test database");
  return execFileSync(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      "infra/compose/e2e.compose.yml",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "aster_e2e",
      "-d",
      "aster_e2e",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      statement,
    ],
    { windowsHide: true, encoding: "utf8" },
  ).trim();
}
async function login(page: Page, email = "alex@aster.local") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).focus();
  await page.keyboard.insertText(email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.insertText("demo-password");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Sign in to demo" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app/overview");
  await expect(page.getByTestId("total-balance")).toBeVisible();
}

test("a real empty customer has safe empty pages and no Alex data", async ({
  page,
}) => {
  sql(
    "INSERT INTO customers(customer_id,display_name,created_at,account_as_of) VALUES ('usr_rc_empty','Empty customer','2026-09-27T02:30:00Z','2026-09-27T02:30:00Z'); INSERT INTO customer_credentials SELECT 'usr_rc_empty','empty@aster.local',password_hash,true FROM customer_credentials WHERE email='alex@aster.local'",
  );
  await login(page, "empty@aster.local");
  await expect(page.getByTestId("total-balance")).toHaveText("¥0.00");
  for (const route of ["accounts", "transactions", "spending", "wealth"]) {
    await page.goto("/app/" + route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: /^Loading/ }),
    ).toHaveCount(0);
    await expect(page.getByText("Alex Chen", { exact: true })).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 320, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("long server-provided transaction labels wrap on narrow screens", async ({
  page,
}) => {
  const original: { title: string; merchant_name: string } = JSON.parse(
    sql(
      "SELECT json_build_object('title',title,'merchant_name',merchant_name) FROM transactions WHERE transaction_id='txn_coffee'",
    ),
  );
  sql(
    "UPDATE transactions SET title=repeat('LongMerchant',30), merchant_name=repeat('LongMerchant',30) WHERE transaction_id='txn_coffee'",
  );
  try {
    await login(page);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/app/transactions/txn_coffee");
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "LongMerchant",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    sql(
      `UPDATE transactions SET title='${original.title.replaceAll("'", "''")}', merchant_name='${original.merchant_name.replaceAll("'", "''")}' WHERE transaction_id='txn_coffee'`,
    );
  }
});

test("another real customer cannot read any Alex-owned resource family", async ({
  page,
  context,
}, info) => {
  await login(page, "empty@aster.local");
  const resources = [
    ["accounts", "account_id", "accounts", "ACCOUNT_NOT_FOUND"],
    ["transactions", "transaction_id", "transactions", "TRANSACTION_NOT_FOUND"],
    [
      "transfer_intents",
      "intent_id",
      "transfer-intents",
      "TRANSFER_INTENT_NOT_FOUND",
    ],
    ["transfers", "transfer_id", "transfers", "TRANSFER_NOT_FOUND"],
    ["cards", "card_id", "cards", "CARD_NOT_FOUND"],
    [
      "card_action_intents",
      "intent_id",
      "card-action-intents",
      "CARD_ACTION_INTENT_NOT_FOUND",
    ],
    ["card_actions", "action_id", "card-actions", "CARD_ACTION_NOT_FOUND"],
    [
      "step_up_challenges",
      "challenge_id",
      "auth/step-up-challenges",
      "STEP_UP_CHALLENGE_NOT_FOUND",
    ],
    [
      "recurring_payments",
      "recurring_payment_id",
      "recurring-payments",
      "RECURRING_PAYMENT_NOT_FOUND",
    ],
    [
      "recurring_payment_action_intents",
      "intent_id",
      "recurring-payment-action-intents",
      "RECURRING_PAYMENT_INTENT_NOT_FOUND",
    ],
    [
      "recurring_payment_actions",
      "action_id",
      "recurring-payment-actions",
      "RECURRING_PAYMENT_ACTION_NOT_FOUND",
    ],
    [
      "suitability_checks",
      "check_id",
      "wealth/suitability-checks",
      "SUITABILITY_CHECK_NOT_FOUND",
    ],
    [
      "investment_order_intents",
      "intent_id",
      "investment-order-intents",
      "INVESTMENT_INTENT_NOT_FOUND",
    ],
    [
      "investment_orders",
      "order_id",
      "investment-orders",
      "INVESTMENT_ORDER_NOT_FOUND",
    ],
  ];
  const outcomes = [];
  for (const [table, column, route, code] of resources) {
    const id = sql(
      `SELECT ${column} FROM ${table} WHERE customer_id='usr_aster_alex' ORDER BY ${column} LIMIT 1`,
    );
    expect(id, table).not.toBe("");
    const response = await context.request.get(
      `${api}/customer/${route}/${encodeURIComponent(id)}`,
    );
    expect(response.status(), route).toBe(404);
    expect((await response.json()).code, route).toBe(code);
    outcomes.push({ route, status: response.status(), code });
  }
  await mkdir("test-results/backend-evidence", { recursive: true });
  await writeFile(
    `test-results/backend-evidence/ownership-${process.env.ASTER_E2E_WIDTH ?? 1440}.json`,
    JSON.stringify(outcomes, null, 2),
  );
  await info.attach("ownership-rejections", {
    body: JSON.stringify(outcomes, null, 2),
    contentType: "application/json",
  });
});

test("browser reauthentication rotates the cookie and rejects the previous session", async ({
  page,
  context,
  browser,
}) => {
  await login(page);
  const previous = await context.cookies();
  const oldValue = previous.find((c) => c.name === "SESSION")?.value;
  const status = await page.evaluate(async (origin) => {
    const token = document.cookie
      .split("; ")
      .find((c) => c.startsWith("XSRF-TOKEN="))
      ?.split("=")[1];
    return (
      await fetch(origin + "/customer/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-XSRF-TOKEN": decodeURIComponent(token ?? ""),
        },
        body: JSON.stringify({
          email: "alex@aster.local",
          password: "demo-password",
        }),
      })
    ).status;
  }, api);
  expect(status).toBe(200);
  expect(
    (await context.cookies()).find((c) => c.name === "SESSION")?.value,
  ).not.toBe(oldValue);
  const stale = await browser.newContext();
  try {
    await stale.addCookies(previous);
    expect((await stale.request.get(api + "/customer/accounts")).status()).toBe(
      401,
    );
    expect(
      (await context.request.get(api + "/customer/accounts")).status(),
    ).toBe(200);
  } finally {
    await stale.close();
  }
});

test("three wrong security codes close the challenge and a fresh challenge can recover", async ({
  page,
  context,
}) => {
  await login(page);
  await page.goto("/app/cards/card_aster_debit");
  await page
    .getByRole("button", { name: "Freeze card", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Confirm card action" })
    .press("Enter");
  await expect(page.getByTestId("card-status")).toHaveText("FROZEN");
  await page
    .getByRole("link", { name: "View card", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Unfreeze card", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Confirm card action" })
    .press("Enter");
  for (const remaining of [2, 1, 0]) {
    await page.getByLabel("Account password").fill("wrong");
    await page.getByLabel("SMS verification code").fill("000000");
    await page.getByRole("button", { name: "Verify and continue" }).click();
    if (remaining)
      await expect(
        page.getByText(`Attempts remaining: ${remaining}`),
      ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Verify and continue" }),
  ).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Verify again" }).click();
  await completeVerification(page);
  await expect(page.getByTestId("card-status")).toHaveText("ACTIVE");
  expect(
    (await (await context.request.get(api + "/customer/session")).json())
      .assuranceLevel,
  ).toBe("AAL1");
});

test("Public search dialog has keyboard focus containment and restoration", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Search public website" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("core reads have bounded request counts and Overview uses its own read model", async ({
  page,
}, info) => {
  await login(page);
  const measurements: Record<string, string[]> = {};
  for (const route of ["overview", "transactions", "spending", "wealth"]) {
    const requests: string[] = [];
    const record = (request: import("@playwright/test").Request) => {
      if (request.url().startsWith(api + "/customer/"))
        requests.push(new URL(request.url()).pathname);
    };
    page.on("request", record);
    await page.goto("/app/" + route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (route === "overview")
      await expect(page.getByTestId("total-balance")).toBeVisible();
    if (route === "transactions")
      await expect(page.getByTestId("transaction-row").first()).toBeVisible();
    if (route === "spending")
      await expect(page.getByTestId("spending-total")).toBeVisible();
    if (route === "wealth")
      await expect(page.getByTestId("portfolio-total")).toBeVisible();
    page.off("request", record);
    measurements[route] = requests;
    expect(requests.length, route).toBeLessThanOrEqual(6);
    expect(requests.length, route).toBe(new Set(requests).size);
    if (route === "overview")
      expect(requests.sort()).toEqual([
        "/customer/overview",
        "/customer/session",
      ]);
  }
  await mkdir("test-results/backend-evidence", { recursive: true });
  await writeFile(
    `test-results/backend-evidence/request-counts-${process.env.ASTER_E2E_WIDTH ?? 1440}.json`,
    JSON.stringify(measurements, null, 2),
  );
  await info.attach("request-counts", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
});

test("real pages have accessible semantics and fit all supported viewports", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const publicRoutes = [
    "/",
    "/banking",
    "/products/flexible-savings",
    "/support",
    "/login",
  ];
  const customerRoutes = [
    "/app/overview",
    "/app/accounts",
    "/app/accounts/acc_current",
    "/app/transactions",
    "/app/payments",
    "/app/cards",
    "/app/spending",
    "/app/wealth",
    "/app/settings",
  ];
  for (const route of [...publicRoutes, ...customerRoutes]) {
    if (route === customerRoutes[0]) await login(page);
    expect((await page.goto(route))?.status(), route).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: /^Loading/ }),
    ).toHaveCount(0);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations, route).toEqual([]);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}`,
      ).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("HTTP headers, session secrecy, cache policy and multi-tab logout", async ({
  page,
  context,
}) => {
  const response = await page.goto("/");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(response?.headers()["strict-transport-security"]).toBeUndefined();
  await login(page);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "SESSION")).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    secure: false,
    path: "/",
  });
  expect(cookies.find((c) => c.name === "XSRF-TOKEN")).toMatchObject({
    httpOnly: false,
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain("SESSION=");
  const accountResponse = await context.request.get(api + "/customer/accounts");
  expect(accountResponse.headers()["cache-control"]).toContain("no-store");
  const tab = await context.newPage();
  await tab.goto("/app/accounts");
  await expect(tab.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await tab.reload();
  await expect(tab).toHaveURL(/login/);
  await tab.goto("/rates");
  await expect(tab.getByRole("heading", { level: 1 })).toBeVisible();
});

test("actual Spring and Next restart retain session and financial state", async ({
  page,
  context,
}) => {
  await login(page);
  const before = await (
    await context.request.get(api + "/customer/overview")
  ).json();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "SESSION",
  )?.value;
  await control("spring-stop");
  try {
    await page.goto("/app/accounts");
    await expect(page.getByText("Session could not be checked.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible();
  } finally {
    await control("spring-start");
  }
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  expect(
    (await context.cookies()).find((c) => c.name === "SESSION")?.value,
  ).toBe(cookie);
  expect(
    await (await context.request.get(api + "/customer/overview")).json(),
  ).toEqual(before);
  await control("next-restart");
  await page.goto("/app/overview");
  await expect(page.getByTestId("total-balance")).toBeVisible();
  expect(
    await (await context.request.get(api + "/customer/overview")).json(),
  ).toEqual(before);
});

test("real PostgreSQL outage reports minimal health and recovers retained data", async ({
  page,
  context,
}) => {
  await login(page);
  const before = await (
    await context.request.get(api + "/customer/accounts")
  ).json();
  await control("database-stop");
  try {
    const health = await context.request.get(api + "/actuator/health");
    expect(health.status()).toBe(503);
    expect(await health.json()).toEqual({ status: "DOWN" });
    const unavailable = await context.request.get(api + "/customer/accounts");
    expect(unavailable.status()).toBe(500);
    expect((await unavailable.json()).code).toBe("PERSISTENCE_UNAVAILABLE");
    expect(unavailable.headers()["x-correlation-id"]).toBeTruthy();
    await page.goto("/rates");
    await expect(
      page.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("jdbc:", { exact: false })).toHaveCount(0);
  } finally {
    await control("database-start");
  }
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Illustrative demo rates, not live quotes."),
  ).toBeVisible();
  expect(
    await (await context.request.get(api + "/customer/accounts")).json(),
  ).toEqual(before);
});

test("a stalled response times out with retry and cannot invent financial data", async ({
  page,
}) => {
  await page.route(
    api + "/customer/session",
    () => new Promise(() => undefined),
  );
  await page.goto("/app/accounts");
  await expect(page.getByText("Session could not be checked.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("¥23,842.31", { exact: true })).toHaveCount(0);
});
