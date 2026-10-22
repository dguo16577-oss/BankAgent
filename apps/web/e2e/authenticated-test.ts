import { test as base, expect, type Page } from "@playwright/test";
import { securityFixture } from "../src/mocks/data/security-fixture";
export async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(securityFixture.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(securityFixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .locator("header")
    .getByRole("link", { name: "Alex Chen", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/overview$/);
  await expect(page.getByTestId("total-balance")).toBeVisible();
}
export const test = base.extend({
  page: async ({ page }, provide) => {
    await signIn(page);
    await provide(page);
  },
});
export { expect };
