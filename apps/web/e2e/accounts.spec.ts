import { test, expect } from "./authenticated-test";

test("login to Overview to Accounts to CNY Current detail", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app/overview");
  await page.getByRole("link", { name: "View all accounts" }).click();
  await expect(page).toHaveURL(/\/app\/accounts$/);
  await expect(page.getByTestId("accounts-total")).toHaveText("¥36,453.68");
  await page.getByRole("link", { name: "View CNY Current account" }).click();
  await expect(page).toHaveURL(/\/app\/accounts\/acc_current$/);
  await expect(
    page.getByRole("heading", { name: "CNY Current", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("available-balance")).toHaveText("¥23,810.31");
  await expect(page.getByText("Starbucks", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Transfer", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/payments\/transfers\/new$/);
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 1440]) {
  test(`Accounts list, detail and foreign account fit ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, heading] of [
      ["accounts", "Accounts"],
      ["accounts/acc_current", "CNY Current"],
      ["accounts/acc_usd", "USD"],
    ]) {
      await page.goto(`/app/${route}`);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      if (route === "accounts/acc_usd")
        await expect(
          page.getByText("¥4,411.37", { exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}

test("unknown account has a clear not-found state", async ({ page }) => {
  await page.goto("/app/accounts/does-not-exist");
  await expect(
    page.getByRole("heading", { name: "Account not found" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Accounts" }).click();
  await expect(page.getByTestId("accounts-total")).toBeVisible();
});
