import { test, expect } from "./authenticated-test";

test("login to Overview, filter Dining and open Starbucks", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app/overview");
  await page.getByRole("link", { name: "View all transactions" }).click();
  await expect(page).toHaveURL(/\/app\/transactions$/);
  await expect(page.getByTestId("transaction-row")).toHaveCount(10);
  await page.getByRole("combobox", { name: "Category" }).selectOption("DINING");
  await expect(page).toHaveURL(/category=DINING/);
  await expect(page.getByTestId("transaction-row")).toHaveCount(5);
  await page
    .getByTestId("transaction-row")
    .filter({
      has: page.getByRole("heading", { name: "Starbucks", exact: true }),
    })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/transactions\/txn_coffee$/);
  await expect(
    page.getByRole("heading", { name: "Starbucks", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("transaction-amount")).toHaveText("−¥32.00");
  await expect(
    page.getByRole("heading", { name: "Merchant", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Not posted", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("account activity link restores the account filter after reload and browser history", async ({
  page,
}) => {
  await page.goto("/app/accounts");
  await page.getByRole("link", { name: "View CNY Current account" }).click();
  await page.getByRole("link", { name: "View all activity" }).click();
  await expect(page).toHaveURL(/accountId=acc_current/);
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue(
    "acc_current",
  );
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue(
    "acc_current",
  );
  await page.getByRole("combobox", { name: "Category" }).selectOption("DINING");
  await expect(page.getByTestId("transaction-row")).toHaveCount(3);
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue(
    "",
  );
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue(
    "acc_current",
  );
  await expect(page.getByTestId("transaction-row")).toHaveCount(10);
});

test("load more, search and clear use API queries", async ({ page }) => {
  await page.goto("/app/transactions");
  await expect(page.getByTestId("transaction-row")).toHaveCount(10);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByTestId("transaction-row")).toHaveCount(20);
  await page.getByRole("searchbox", { name: "Search" }).fill("Jamie");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("transaction-row")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/transactions$/);
  await expect(page.getByTestId("transaction-row")).toHaveCount(20);
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`transaction list and detail fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "transactions?category=DINING",
      "transactions/txn_coffee",
      "transactions/txn_history_0_07",
    ]) {
      await page.goto(`/app/${route}`);
      if (route.startsWith("transactions?"))
        await expect(page.getByTestId("transaction-row").first()).toBeVisible();
      else await expect(page.getByTestId("transaction-amount")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}
test("unknown transaction ID shows not found", async ({ page }) => {
  await page.goto("/app/transactions/missing");
  await expect(
    page.getByRole("heading", { name: "Transaction not found" }),
  ).toBeVisible();
});
