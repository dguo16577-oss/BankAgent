import { test, expect } from "./authenticated-test";

test("demo entry and API-backed user", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app/overview");
  await expect(page).toHaveURL(/\/app\/overview$/);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alex Chen", { exact: true })).toBeVisible();
  await expect(page.getByTestId("total-balance")).toHaveText("¥36,453.68");
  for (const text of [
    "CNY Current",
    "¥23,842.31",
    "$621.32",
    "Starbucks",
    "••8821",
    "••1937",
    "Credit card bill",
    "¥18,320.00",
  ]) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(9);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const [route, heading] of [
  ["overview", "Overview"],
  ["accounts", "Accounts"],
  ["accounts/acc_current", "CNY Current"],
  ["payments", "Payments"],
  ["cards", "Cards"],
  ["spending", "Spending"],
  ["wealth", "Wealth"],
  ["agent", "Ask Aster about your banking"],
  ["settings", "Settings"],
]) {
  test(`direct route /app/${route}`, async ({ page }) => {
    await page.goto(`/app/${route}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Alex Chen", { exact: true })).toBeVisible();
    const activeRoute = route.startsWith("accounts") ? "accounts" : route;
    await expect(
      page.locator(`nav a[href="/app/${activeRoute}"]`),
    ).toHaveAttribute("aria-current", "page");
  });
}

for (const width of [320, 390]) {
  test(`narrow viewport ${width}px keeps the document within the screen`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/app/overview");
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("total-balance")).toHaveText("¥36,453.68");
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
