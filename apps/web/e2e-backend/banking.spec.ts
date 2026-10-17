import { completeVerification } from "../e2e-shared/verification";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const packaged = Boolean(process.env.ASTER_PACKAGED_ORIGIN);
const origin =
  process.env.ASTER_PACKAGED_ORIGIN ??
  process.env.ASTER_E2E_BACKEND_ORIGIN ??
  "http://localhost:18080";
test.describe.configure({ mode: "serial" });
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Sign in to demo" }).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page
    .locator("header")
    .getByRole("link", { name: "Alex Chen", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/overview$/);
  await expect(page.getByTestId("total-balance")).toBeVisible();
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function snapshot(page: Page, name: string) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const original = page.viewportSize();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await fits(page);
    await page.screenshot({
      path: `docs/screenshots/${packaged ? "m24" : "m23"}-${name}-${width}.png`,
      fullPage: true,
      animations: "disabled",
      style: "nextjs-portal { display: none !important; }",
    });
  }
  if (original) await page.setViewportSize(original);
}
function expireSessions() {
  const project = process.env.M22_E2E_PROJECT;
  if (!project?.startsWith("aster-m22-e2e-"))
    throw new Error("Expiry test requires the isolated orchestrator database.");
  execFileSync(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      resolve("infra/compose/e2e.compose.yml"),
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "aster_e2e",
      "-d",
      "aster_e2e",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "UPDATE security_sessions SET status='EXPIRED' WHERE status='ACTIVE'",
    ],
    { windowsHide: true },
  );
}

test("anonymous Public, real login, persistent financial journey and logout", async ({
  page,
  context,
}) => {
  test.setTimeout(360_000);
  const journeyStartedAt = Date.now();
  let documentNavigations = 0;
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame())
      documentNavigations++;
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (
      /hydration|CORS|unhandled|duplicate key|Each child|same key|Content Security Policy|Refused to/i.test(
        message.text(),
      )
    )
      pageErrors.push(message.text());
  });
  const requests: {
    method: string;
    url?: string;
    path: string;
    status: number;
    worker: boolean;
  }[] = [];
  const pending: Promise<void>[] = [];
  const wrongOrigin: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (/^\/(customer|public)\//.test(u.pathname) && u.origin !== origin)
      wrongOrigin.push(r.url());
  });
  page.on("response", (r) => {
    if (
      !r.url().startsWith(origin + "/") ||
      !/^\/(customer|public)\//.test(new URL(r.url()).pathname)
    )
      return;
    pending.push(
      (async () => {
        requests.push({
          ...(packaged ? { url: r.url() } : {}),
          method: r.request().method(),
          path: new URL(r.url()).pathname,
          status: r.status(),
          worker: r.fromServiceWorker(),
        });
        expect(r.fromServiceWorker()).toBe(false);
        expect(r.headers()["access-control-allow-origin"]).toBe(
          packaged
            ? undefined
            : (process.env.ASTER_E2E_WEB_ORIGIN ?? "http://localhost:3000"),
        );
        if (!packaged && new URL(r.url()).pathname.startsWith("/customer/"))
          expect(r.headers()["access-control-allow-credentials"]).toBe("true");
      })(),
    );
  });
  await test.step("Public stays anonymous across catalog, fees, rates, support and search", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Everyday banking",
    );
    for (const route of [
      "/banking",
      "/products/flexible-savings",
      "/rates",
      "/fees",
      "/offers",
      "/support",
    ]) {
      const publicEndpoint: Record<string, string> = {
        "/banking": "/public/catalog",
        "/products/flexible-savings": "/public/catalog/flexible-savings",
        "/rates": "/public/rates",
        "/fees": "/public/catalog",
        "/offers": "/public/offers",
        "/support": "/public/support/articles",
      };
      const loaded = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === publicEndpoint[route] &&
          r.status() === 200,
      );
      await page.goto(route);
      await loaded;
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByText(/Unable to reach|Something went wrong/),
      ).toHaveCount(0);
    }
    const article = page.getByRole("link", {
      name: /Explore Understanding pending card payments/,
    });
    await article.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Understanding pending",
    );
    await page
      .getByRole("button", { name: "Search public website" })
      .press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("searchbox").fill("savings");
    await dialog
      .getByRole("button", { name: "Search", exact: true })
      .press("Enter");
    await expect(dialog.getByRole("link").first()).toBeVisible();
    await page.keyboard.press("Escape");
    expect((await context.cookies()).some((c) => c.name === "SESSION")).toBe(
      false,
    );
  });
  await test.step("deep link guard, CSRF bootstrap, cookie login and authoritative session", async () => {
    await page.goto("/app/accounts/acc_current");
    await expect(page).toHaveURL(/\/login/);
    await login(page);
    await expect(page.getByTestId("total-balance")).toHaveText("¥36,453.68");
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "SESSION")).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    expect(cookies.find((c) => c.name === "XSRF-TOKEN")).toMatchObject({
      httpOnly: false,
      sameSite: "Lax",
      path: "/",
    });
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "SESSION=",
    );
    await page.goto("/app/accounts/acc_current");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "CNY Current", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("¥23,810.31", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View all activity" }).press("Enter");
    await expect(page.getByLabel("Account", { exact: true })).toHaveValue(
      "acc_current",
    );
  });
  await test.step("server filters and opaque cursor pagination cover every record once", async () => {
    await page.goto("/app/transactions");
    await expect(page.getByTestId("transaction-row")).toHaveCount(10);
    while (
      await page.getByRole("button", { name: "Load more", exact: true }).count()
    ) {
      const before = await page.getByTestId("transaction-row").count();
      await page
        .getByRole("button", { name: "Load more", exact: true })
        .press("Enter");
      await expect
        .poll(() => page.getByTestId("transaction-row").count())
        .toBeGreaterThan(before);
    }
    const hrefs = await page
      .getByTestId("transaction-row")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("href")));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.length).toBe(61);
    await page
      .getByRole("searchbox", { name: "Search", exact: true })
      .fill("Jamie");
    await page
      .getByRole("button", { name: "Search", exact: true })
      .press("Enter");
    await expect(page.getByTestId("transaction-row")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .press("Enter");
    await expect(page).toHaveURL(/\/app\/transactions$/);
    const diningRequest = page.waitForRequest(
      (r) =>
        r.url().startsWith(origin + "/customer/transactions?") &&
        new URL(r.url()).searchParams.get("category") === "DINING",
    );
    await page.getByLabel("Category", { exact: true }).selectOption("DINING");
    expect(
      new URL((await diningRequest).url()).searchParams.has("cursor"),
    ).toBe(false);
    await expect(page).toHaveURL(/category=DINING/);
    await expect(page.getByTestId("transaction-row")).toHaveCount(5);
    await snapshot(page, "transactions");
    await page
      .getByTestId("transaction-row")
      .filter({ hasText: "Starbucks" })
      .first()
      .press("Enter");
    await expect(page.getByTestId("transaction-amount")).toHaveText("−¥32.00");
    await snapshot(page, "transaction");
  });
  await test.step("one transfer survives a lost response with its original key", async () => {
    await page.goto("/app/payments/transfers/new");
    await page
      .getByLabel("Source account", { exact: true })
      .selectOption("acc_current");
    await page
      .getByLabel("Recipient", { exact: true })
      .selectOption("recipient_zhang");
    await page.getByLabel("Amount (CNY)", { exact: true }).fill("500");
    await page.getByRole("button", { name: "Review transfer" }).press("Enter");
    await expect(page.getByText("¥23,310.31", { exact: true })).toBeVisible();
    await snapshot(page, "transfer-review");
    const otherTab = await context.newPage();
    await otherTab.goto("/app/accounts/acc_current");
    await expect(
      otherTab.getByText("¥23,842.31", { exact: true }),
    ).toBeVisible();
    const keys: string[] = [];
    let dropped = false;
    await page.route(origin + "/customer/transfers", async (route) => {
      keys.push(route.request().headers()["idempotency-key"]);
      const response = await route.fetch(); // Real Spring commits; only the first response is lost.
      expect(response.status()).toBe(200);
      if (!dropped) {
        dropped = true;
        await route.abort("failed");
      } else await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Confirm transfer" }).press("Enter");
    await completeVerification(page);
    await expect(page.getByText(/Transfer failed:/)).toBeVisible();
    await page
      .getByRole("button", { name: "Retry confirmation" })
      .press("Enter");
    await expect(
      page.getByRole("heading", { name: "Transfer completed" }),
    ).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    await page.unroute(origin + "/customer/transfers");
    await page.reload();
    await expect(page.getByTestId("receipt-amount")).toHaveText("¥500.00");
    await page.goBack();
    await page.goForward();
    await expect(page.getByTestId("receipt-amount")).toHaveText("¥500.00");
    expect(keys).toHaveLength(2);
    await snapshot(page, "transfer");
    await page.goto("/app/accounts/acc_current");
    await expect(page.getByText("¥23,342.31", { exact: true })).toBeVisible();
    await otherTab.reload();
    await expect(
      otherTab.getByText("¥23,342.31", { exact: true }),
    ).toBeVisible();
    await otherTab.close();
    await expect(page.getByText("¥23,310.31", { exact: true })).toBeVisible();
  });
  await test.step("protective freeze and intent-bound unfreeze step-up", async () => {
    await page.goto("/app/cards/card_aster_debit");
    await page
      .getByRole("button", { name: "Freeze card", exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "Confirm card action" })
      .press("Enter");
    await expect(page.getByTestId("card-status")).toHaveText("FROZEN");
    await page.reload();
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
    await snapshot(page, "b4-step-up");
    await completeVerification(page);
    await expect(page.getByTestId("card-status")).toHaveText("ACTIVE");
  });
  await test.step("recurring authority and history remain server decisions", async () => {
    await page.goto("/app/spending");
    await expect(page.getByTestId("spending-total")).toHaveText("¥4,968.00");
    await page.getByRole("link", { name: /Netflix.*Monthly/ }).press("Enter");
    await page
      .getByRole("button", { name: "Stop future payments" })
      .press("Enter");
    await page
      .getByRole("button", { name: "Confirm stop future payments" })
      .press("Enter");
    await completeVerification(page);
    await expect(page.getByTestId("recurring-status")).toHaveText("STOPPED");
    await page.reload();
    await expect(page.getByTestId("recurring-status")).toHaveText("STOPPED");
    await page
      .getByRole("link", { name: "View recurring payment", exact: true })
      .press("Enter");
    await expect(
      page.getByRole("link", { name: "View Netflix payment 1" }),
    ).toBeVisible();
    await page.goto("/app/spending");
    await expect(page.getByTestId("spending-total")).toHaveText("¥4,968.00");
    await page.getByRole("link", { name: /Bookshop.*Monthly/ }).press("Enter");
    await expect(
      page.getByRole("button", { name: "Stop future payments" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Detected from 3 similar monthly payments."),
    ).toBeVisible();
  });
  await test.step("backend suitability blocks R3 and executes a suitable R2 order", async () => {
    await page.goto("/app/wealth");
    await page
      .getByRole("link", { name: /Aster Balanced Growth/ })
      .press("Enter");
    await page
      .getByRole("button", { name: "Check suitability" })
      .press("Enter");
    await expect(page.getByTestId("suitability-result")).toHaveText(
      "NOT_SUITABLE",
    );
    await expect(
      page.getByRole("button", { name: "Invest unavailable" }),
    ).toBeDisabled();
    await page.goto("/app/wealth");
    await page.getByRole("link", { name: /Aster Stable Bond/ }).press("Enter");
    await page
      .getByRole("button", { name: "Check suitability" })
      .press("Enter");
    await expect(page.getByTestId("suitability-result")).toHaveText("SUITABLE");
    await page
      .getByRole("link", { name: "Invest", exact: true })
      .press("Enter");
    await page
      .getByLabel("Source account", { exact: true })
      .selectOption("acc_current");
    await page.getByLabel("Amount (CNY)", { exact: true }).fill("1000");
    await page
      .getByRole("button", { name: "Review investment" })
      .press("Enter");
    await page
      .getByRole("button", { name: "Confirm investment" })
      .press("Enter");
    await completeVerification(page);
    await expect(
      page.getByRole("heading", { name: "Investment completed" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Investment completed" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "View investment transaction" })
      .press("Enter");
    await expect(page.getByTestId("transaction-amount")).toHaveText(
      "−¥1,000.00",
    );
    await page.goto("/app/wealth");
    await expect(page.getByTestId("portfolio-total")).toHaveText("¥19,320.00");
    await snapshot(page, "wealth");
    await page.goto("/app/accounts/acc_current");
    await expect(page.getByText("¥22,342.31", { exact: true })).toBeVisible();
  });
  await test.step("final dashboard reflects persisted results, then logout revokes access", async () => {
    await page.goto("/app/overview");
    await expect(page.getByTestId("total-balance")).toHaveText("¥34,953.68");
    await expect(page.getByText("¥19,320.00", { exact: true })).toBeVisible();
    await expect(page.getByText("¥4,968.00", { exact: true })).toBeVisible();
    await expect(page.getByText("Netflix", { exact: true })).toHaveCount(0);
    await expect(page.getByText("To Zhang San", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Aster Stable Bond", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toHaveCount(2);
    await expect(page.getByText(/3\.50?%/)).toBeVisible();
    await snapshot(page, "overview");
    await page.setViewportSize({ width: 320, height: 900 });
    await fits(page);
    const storage = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }));
    expect(JSON.stringify(storage)).not.toMatch(
      /demo-password|246810|authorizationId|balance|aster-banking-state|SESSION/,
    );
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .press("Enter");
    await expect(page).toHaveURL(/\/login/);
    expect(
      (await context.request.get(origin + "/customer/accounts")).status(),
    ).toBe(401);
    await page.goto("/rates");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/app/accounts");
    await expect(page).toHaveURL(/\/login/);
  });
  await Promise.all(pending);
  expect(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
  ).toBe(0);
  expect(pageErrors).toEqual([]);
  expect(wrongOrigin).toEqual([]);
  expect(
    requests.filter(
      (r) =>
        r.status >= 400 &&
        !(
          r.status === 401 &&
          ["/customer/session", "/customer/accounts"].includes(r.path)
        ),
    ),
  ).toEqual([]);
  expect(requests.every((r) => !r.worker)).toBe(true);
  expect(requests.filter((r) => r.status >= 500)).toEqual([]);
  // Each full document navigation creates a fresh QueryClient, including the
  // session-aware Public header. Login/logout may bootstrap and refresh session
  // state. Bound those explicit transitions instead of assuming fewer than 30
  // session requests across this 30-document journey.
  const authTransitions = requests.filter(
    (r) =>
      r.method === "POST" &&
      ["/customer/auth/login", "/customer/auth/logout"].includes(r.path),
  ).length;
  expect(
    requests.filter((r) => r.path === "/customer/session").length,
  ).toBeLessThanOrEqual(
    documentNavigations +
      2 * authTransitions +
      2 +
      Math.floor((Date.now() - journeyStartedAt) / 30_000),
  );
  const publicPaths = new Set(
    requests
      .filter((r) => r.path.startsWith("/public/") && r.status === 200)
      .map((r) =>
        r.path
          .replace(/\/catalog\/.+/, "/catalog/{slug}")
          .replace(/\/articles\/.+/, "/articles/{slug}"),
      ),
  );
  expect(publicPaths.size).toBe(9);
  mkdirSync("test-results/backend-evidence", { recursive: true });
  writeFileSync(
    `test-results/backend-evidence/${packaged ? "packaged-network" : "network"}.json`,
    JSON.stringify(requests, null, 2),
  );
});

test("expired session leaves no Customer page; anonymous Public still works", async ({
  page,
}) => {
  await login(page);
  expireSessions();
  await page.getByRole("link", { name: "View all accounts" }).press("Enter");
  await expect(page).toHaveURL(/\/login\?reason=expired/);
  await expect(page.getByTestId("total-balance")).toHaveCount(0);
  await page.goto("/rates");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByText("Illustrative demo rates, not live quotes."),
  ).toBeVisible();
});

test("unavailable Spring produces retry UI and never MSW fallback", async ({
  page,
}) => {
  await page.route(origin + "/**", (route) => route.abort("connectionrefused"));
  await page.goto("/app/accounts");
  await expect(page.getByText("Session could not be checked.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("¥23,842.31", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).press("Enter");
  await expect(page.getByText("Session could not be checked.")).toBeVisible();
});
