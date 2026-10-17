import { completeVerification } from "../e2e-shared/verification";
import { auditPage } from "./audit-helpers";
import { test, expect } from "./authenticated-test";

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`domestic transfer journey, refresh and read-model consistency at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const fits = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    await page.goto("/app/overview");
    await expect(page.getByTestId("total-balance")).toHaveText("¥36,453.68");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Payments", exact: true })
      .click();
    await expect(page.getByText("Zhang San", { exact: true })).toBeVisible();
    await fits();
    await page.getByRole("link", { name: "New bank transfer" }).click();
    await page.getByLabel("Source account").selectOption("acc_current");
    await page
      .getByLabel("Recipient", { exact: true })
      .selectOption("recipient_zhang");
    await page.getByLabel("Amount (CNY)").fill("500");
    await page.getByLabel("Note (optional)").fill("Family expenses");
    await fits();
    await page.getByRole("button", { name: "Review transfer" }).click();
    await expect(
      page.getByRole("heading", { name: "Review transfer" }),
    ).toBeVisible();
    await expect(page.getByText("¥23,310.31", { exact: true })).toBeVisible();
    if (width === 1440) await auditPage(page);
    const reviewUrl = page.url();
    await page.reload();
    await expect(
      page.getByText("Family expenses", { exact: true }),
    ).toBeVisible();
    await fits();
    await page.getByRole("button", { name: "Confirm transfer" }).click();
    await completeVerification(page);
    await expect(
      page.getByRole("heading", { name: "Transfer completed" }),
    ).toBeVisible();
    await expect(page.getByTestId("receipt-amount")).toHaveText("¥500.00");
    await fits();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Transfer completed" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "View transaction" }).click();
    await expect(
      page.getByRole("heading", { name: "To Zhang San", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("transaction-amount")).toHaveText("−¥500.00");
    await page.getByRole("link", { name: "CNY Current", exact: true }).click();
    await expect(page.getByText("¥23,342.31", { exact: true })).toBeVisible();
    await expect(page.getByText("¥23,310.31", { exact: true })).toBeVisible();
    await expect(page.getByText("¥32.00", { exact: true })).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Overview", exact: true })
      .click();
    await expect(page.getByTestId("total-balance")).toHaveText("¥35,953.68");
    await expect(page.getByText("¥4,968.00", { exact: true })).toBeVisible();
    await expect(page.getByText("To Zhang San", { exact: true })).toBeVisible();
    // Refreshing a completed review can recover the original receipt, never debit twice.
    await page.goto(reviewUrl);
    await page.getByRole("button", { name: "View completed receipt" }).click();
    await expect(
      page.getByRole("heading", { name: "Transfer completed" }),
    ).toBeVisible();
    await page.goto("/app/accounts/acc_current");
    await expect(page.getByText("¥23,342.31", { exact: true })).toBeVisible();
  });
}
test("missing intent and receipt show not found", async ({ page }) => {
  for (const route of [
    "/app/payments/transfers/review/missing",
    "/app/payments/transfers/missing",
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: "Transfer not found" }),
    ).toBeVisible();
  }
});
