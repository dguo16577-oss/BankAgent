import { test, expect } from "@playwright/test";
import { signIn } from "./authenticated-test";

test("public investment keeps suitability and order review on the product page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await signIn(page);
  await page.goto("/products/money-market-investing");
  await page
    .getByRole("link", { name: "Start investment", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Invest in/ })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Source account" })
    .selectOption({ index: 1 });
  await page.getByRole("textbox", { name: "Amount (CNY)" }).fill("100.00");
  await page
    .getByRole("button", { name: "Check suitability and review" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review investment" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/products\/money-market-investing/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
