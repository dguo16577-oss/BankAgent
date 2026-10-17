import { completeVerification } from "../e2e-shared/verification";
import { test, expect } from "@playwright/test";
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Sign in to demo" }).click();
  await expect(page).toHaveURL(/\/$/);
}
for (const width of [390]) {
  test(`session-aware public header and persisted application journey at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    await signIn(page);
    await page.goto("/");
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Alex Chen", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await page.goto("/products/everyday-debit-card");
    await page.getByRole("link", { name: "Apply now", exact: true }).click();
    await page
      .getByLabel("Contact email", { exact: true })
      .fill("manual-test@example.com");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Review application", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit application", exact: true })
      .click();
    await expect(page.getByLabel("Contact email", { exact: true })).toHaveValue(
      "manual-test@example.com",
    );
    await page
      .getByRole("button", { name: "Review application", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Submit application", exact: true })
      .click();
    await completeVerification(page);
    await expect(
      page.getByRole("heading", {
        name: "Submitted · Awaiting review",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/products\/everyday-debit-card#apply/);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Submitted · Awaiting review",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/products/personal-loan");
    await page.getByRole("link", { name: "Apply now", exact: true }).click();
    await page
      .getByLabel("Contact email", { exact: true })
      .fill("manual-test@example.com");
    await page
      .getByLabel("Monthly income (CNY)", { exact: true })
      .fill("12000");
    await page
      .getByLabel("Requested amount (CNY)", { exact: true })
      .fill("10000.50");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Review application", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Submit application", exact: true })
      .click();
    await completeVerification(page);
    await expect(page).toHaveURL(/\/products\/personal-loan#apply/);
    await expect(page.getByText("¥10,000.50", { exact: true })).toBeVisible();
    await page
      .getByRole("combobox", { name: "Language / 语言" })
      .selectOption("zh-CN");
    await expect(
      page.getByRole("heading", { name: "已提交 · 待审核", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/b4-backend-applications-${width}.png`,
      fullPage: true,
    });
  });
}
test("anonymous application returns to the requested product after login", async ({
  page,
}) => {
  await page.goto("/app/applications/new?product=personal-loan");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page
    .getByRole("button", { name: "Sign in to demo", exact: true })
    .click();
  await expect(page).toHaveURL(/applications\/new\?product=personal-loan/);
  await expect(
    page.getByLabel("Requested amount (CNY)", { exact: true }),
  ).toBeVisible();
});
