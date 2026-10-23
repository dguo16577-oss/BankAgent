import { completeVerification } from "../e2e-shared/verification";
import { auditPage } from "./audit-helpers";
import { test, expect } from "@playwright/test";
import { signIn } from "./authenticated-test";
import { securityFixture } from "../src/mocks/data/security-fixture";
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`login, intent-bound verification, control enable and logout ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const fits = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    await page.goto("/app/cards");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: "Welcome to Aster" }),
    ).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/m8-login-${width}.png`,
      fullPage: true,
      animations: "disabled",
      style: "nextjs-portal { display: none !important; }",
    });
    await page.getByLabel("Email", { exact: true }).fill(securityFixture.email);
    await page.getByLabel("Password", { exact: true }).fill("incorrect");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "incorrect",
    );
    await fits();
    await signIn(page);
    await fits();
    await page.goto("/app/cards/card_aster_debit");
    await page
      .getByRole("button", { name: "Freeze card", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm card action" }).click();
    await page.getByRole("link", { name: "View card", exact: true }).click();
    await expect(page.getByTestId("card-status")).toHaveText("FROZEN");
    await page
      .getByRole("button", { name: "Unfreeze card", exact: true })
      .click();
    async function verify(wrong: boolean) {
      await expect(page).toHaveURL(/actions\/review\//);
      const original = page.url();
      await page.getByRole("button", { name: "Confirm card action" }).click();
      await expect(
        page.getByRole("heading", { name: "Verify this action" }),
      ).toBeVisible();
      if (width === 1440) await auditPage(page);
      await fits();
      if (wrong) {
        await page.getByLabel("Account password").fill("wrong");
        await page.getByLabel("SMS verification code").fill("000000");
        await page.getByRole("button", { name: "Verify and continue" }).click();
        await expect(page.getByText("Attempts remaining: 2")).toBeVisible();
      }
      expect(page.url()).toBe(original);
      await page.screenshot({
        path: `docs/screenshots/b4-${wrong ? "unfreeze" : "enable"}-verification-${width}.png`,
        fullPage: true,
      });
      await completeVerification(page);
      await expect(
        page.getByRole("heading", { name: "Card action completed" }),
      ).toBeVisible();
      await fits();
      await page.getByRole("link", { name: "View card", exact: true }).click();
    }
    await verify(true);
    await expect(page.getByTestId("card-status")).toHaveText("ACTIVE");
    await page.getByRole("switch", { name: "Online payments" }).uncheck();
    await page.getByRole("button", { name: "Review control changes" }).click();
    await page.getByRole("button", { name: "Confirm card action" }).click();
    await completeVerification(page);
    await page.getByRole("link", { name: "View card", exact: true }).click();
    await page.getByRole("switch", { name: "Online payments" }).check();
    await page.getByRole("button", { name: "Review control changes" }).click();
    await verify(false);
    await expect(
      page.getByRole("switch", { name: "Online payments" }),
    ).toBeChecked();
    await page.goto("/app/overview");
    await expect(page.getByTestId("total-balance")).toHaveText("¥36,453.68");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await fits();
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/app/accounts");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    const response = await page.evaluate(async () => {
      const r = await fetch("/customer/accounts");
      return { status: r.status, body: await r.json() };
    });
    expect(response).toMatchObject({
      status: 401,
      body: { code: "SESSION_REVOKED" },
    });
  });
}

test("expired persisted demo clock requires login and explains expiry", async ({
  page,
}) => {
  await signIn(page);
  await page.evaluate(() => {
    const key = "aster-banking-state-v1";
    const state = JSON.parse(sessionStorage.getItem(key)!);
    state.clockAt = new Date(
      Date.parse(state.clockAt) + 60 * 60_000,
    ).toISOString();
    sessionStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto("/app/accounts");
  await expect(page).toHaveURL(/\/login\?reason=expired/);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "session expired",
  );
  const status = await page.evaluate(
    async () => (await fetch("/customer/accounts")).status,
  );
  expect(status).toBe(401);
});
