import { test, expect } from "@playwright/test";
test("public sign-in returns to the originating product and application stays there", async ({
  page,
}) => {
  await page.goto("/products/personal-loan?source=manual#apply");
  await page
    .locator("header")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(/login\?next=/);
  await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page
    .getByRole("button", { name: "Sign in to demo", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/products\/personal-loan\?source=manual#apply$/,
  );
  await expect(
    page.getByLabel("Requested amount (CNY)", { exact: true }),
  ).toBeVisible();
});
test("anonymous product application signs in and resumes on the same product", async ({
  page,
}) => {
  await page.goto("/products/everyday-debit-card");
  await page.getByRole("link", { name: "Apply now", exact: true }).click();
  await page
    .locator("#apply")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page
    .getByRole("button", { name: "Sign in to demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/products\/everyday-debit-card#apply$/);
  await expect(page.getByLabel("Contact email", { exact: true })).toBeVisible();
});
for (const width of [320, 390, 1440]) {
  test(`login returns to bank home and personal banking has a home button at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/login");
    await page
      .getByRole("link", { name: "Back to bank home", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await page
      .locator("header")
      .getByRole("link", { name: "Sign in", exact: true })
      .click();
    await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
    await page.getByLabel("Password", { exact: true }).fill("demo-password");
    await page
      .getByRole("button", { name: "Sign in to demo", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await page
      .locator("header")
      .getByRole("link", { name: "Alex Chen", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/overview$/);
    await page
      .getByRole("combobox", { name: "Language / 语言" })
      .selectOption("zh-CN");
    await expect(
      page.getByRole("link", { name: "返回银行首页", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/bank-home-return-${width}.png`,
      fullPage: false,
    });
    await page.getByRole("link", { name: "返回银行首页", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Alex Chen", exact: true }),
    ).toBeVisible();
  });
}
