import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import type { components } from "../src/generated/customer-api";

type Application = components["schemas"]["ProductApplication"];
const api = "http://localhost:18080";

// The local development DB only. Never reset tables or remove pre-existing requests.
function sql(statement: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "aster-banking-postgres-1",
      "psql",
      "-U",
      "aster_local",
      "-d",
      "aster_banking",
      "-tA",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      statement,
    ],
    { encoding: "utf8", windowsHide: true },
  ).trim();
}

test("real browser submits card and loan, PostgreSQL persists them, and logout revokes access", async ({
  page,
}) => {
  const marker = `browser-${crypto.randomUUID()}@example.com`;
  const created: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/app/applications/new?product=everyday-debit-card");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
    await page.getByLabel("Password", { exact: true }).fill("demo-password");
    const loginResponse = page.waitForResponse(
      (r) => r.url() === `${api}/customer/auth/login`,
    );
    await page
      .getByRole("button", { name: "Sign in to demo", exact: true })
      .click();
    const login = await loginResponse;
    expect(login.status()).toBe(200);
    expect(login.fromServiceWorker()).toBe(false);
    await expect(page).toHaveURL(
      /\/app\/applications\/new\?product=everyday-debit-card/,
    );

    await page.goto("/");
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Alex Chen", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "docs/screenshots/applications-real-header.png",
      fullPage: false,
    });

    const before = sql(
      "select json_agg(r order by account_id)::text from (select account_id,balance,pending_amount from accounts) r",
    );
    for (const product of ["everyday-debit-card", "personal-loan"]) {
      // Explicitly fail instead of overwriting the user's existing application.
      expect(
        sql(
          `select count(*) from product_applications where customer_id='usr_aster_alex' and product_id='${product}'`,
        ),
        `Pre-existing ${product} application must be preserved`,
      ).toBe("0");
      await page.goto(`/products/${product}`);
      await page.getByRole("link", { name: "Apply now", exact: true }).click();
      await page.getByLabel("Contact email", { exact: true }).fill(marker);
      if (product === "personal-loan") {
        await page
          .getByLabel("Monthly income (CNY)", { exact: true })
          .fill("12000");
        await page
          .getByLabel("Requested amount (CNY)", { exact: true })
          .fill("10000.50");
        await page
          .getByRole("combobox", { name: "Term (months)", exact: true })
          .selectOption("12");
      }
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Review application", exact: true })
        .click();
      const responsePromise = page.waitForResponse(
        (r) =>
          r.url() === `${api}/customer/applications` &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Submit application", exact: true })
        .click();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      expect(response.fromServiceWorker()).toBe(false);
      const application = (await response.json()) as Application;
      expect(application.id).toMatch(/^application_[A-Za-z0-9_-]+$/);
      created.push(application.id);
      expect(response.request().headers()["x-xsrf-token"]).toBeTruthy();
      expect(response.request().headers()["idempotency-key"]).toBeTruthy();
      expect(
        sql(
          `select status from product_applications where application_id='${application.id}' and contact_email='${marker}'`,
        ),
      ).toBe("SUBMITTED");
      await expect(page).toHaveURL(new RegExp(`/products/${product}#apply$`));
      await page.reload();
      await expect(
        page.getByRole("heading", {
          name: "Submitted · Awaiting review",
          exact: true,
        }),
      ).toBeVisible();
      if (product === "personal-loan") {
        expect(
          sql(
            `select requested_amount::text from product_applications where application_id='${application.id}'`,
          ),
        ).toBe("10000.50");
        await expect(
          page.getByText("¥10,000.50", { exact: true }),
        ).toBeVisible();
      }
    }
    expect(
      sql(
        "select json_agg(r order by account_id)::text from (select account_id,balance,pending_amount from accounts) r",
      ),
    ).toBe(before);
    await page
      .getByRole("combobox", { name: "Language / 语言" })
      .selectOption("zh-CN");
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await expect(
        page.getByRole("heading", { name: "已提交 · 待审核", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `docs/screenshots/applications-real-detail-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto("/app/applications");
    await expect(
      page.getByRole("link", { name: "个人贷款", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/");
    await expect(
      page.locator("header").getByRole("link", { name: "登录", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    // IDs were returned by this test's requests; marker additionally proves ownership.
    for (const id of created) {
      sql(
        `delete from product_applications where application_id='${id}' and contact_email='${marker}'`,
      );
      expect(
        sql(
          `select count(*) from product_applications where application_id='${id}' and contact_email='${marker}'`,
        ),
      ).toBe("0");
    }
  }
});
