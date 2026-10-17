import { test, expect } from "@playwright/test";
import { recipientJourney } from "../e2e-shared/recipient-journey";
test("B2 recipient persistent payment journey", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Sign in to demo" }).click();
  await expect(page).toHaveURL(/\/$/);
  await recipientJourney(page);
});
