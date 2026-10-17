import { completeVerification } from "../e2e-shared/verification";
import { test, expect } from "./authenticated-test";
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`spending drilldown and bank-side recurring stop at ${width}px`, async ({
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
      .getByRole("link", { name: "Spending", exact: true })
      .click();
    await expect(page.getByTestId("spending-total")).toHaveText("¥4,968.00");
    await fits();
    await page.getByRole("link", { name: /Dining/ }).click();
    await expect(
      page.getByRole("heading", { name: "Transactions", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Category", { exact: true })).toHaveValue(
      "DINING",
    );
    await expect(
      page.getByText("Family dinner", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Starbucks", { exact: true })).toBeVisible();
    await fits();
    expect(new URL(page.url()).searchParams.get("to")).toBe(
      "2026-09-27T10:30:00+08:00",
    );
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Spending", exact: true })
      .click();
    await page.getByRole("link", { name: /Netflix.*Monthly/ }).click();
    await expect(
      page.getByRole("heading", { name: "Netflix", level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("recurring-status")).toHaveText("ACTIVE");
    await fits();
    await page.getByRole("button", { name: "Stop future payments" }).click();
    await expect(
      page.getByRole("heading", { name: "Review future payment stop" }),
    ).toBeVisible();
    await expect(page.getByText(/may not terminate/)).toBeVisible();
    await fits();
    await page.reload();
    await page
      .getByRole("button", { name: "Confirm stop future payments" })
      .click();
    await completeVerification(page);
    await expect(
      page.getByRole("heading", { name: "Future payments stopped" }),
    ).toBeVisible();
    await expect(page.getByTestId("recurring-status")).toHaveText("STOPPED");
    await fits();
    await page.reload();
    await page
      .getByRole("link", { name: "View recurring payment", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Netflix", level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("recurring-status")).toHaveText("STOPPED");
    await expect(
      page.getByRole("link", { name: "View Netflix payment 1" }),
    ).toBeVisible();
    await fits();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Overview", exact: true })
      .click();
    await expect(page.getByTestId("total-balance")).toHaveText("¥36,453.68");
    await expect(page.getByText("Netflix", { exact: true })).toHaveCount(0);
    await fits();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Spending", exact: true })
      .click();
    await expect(page.getByTestId("spending-total")).toHaveText("¥4,968.00");
    await page.getByRole("link", { name: /Bookshop.*Monthly/ }).click();
    await expect(
      page.getByText("Detected from 3 similar monthly payments."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Stop future payments" }),
    ).toHaveCount(0);
    await fits();
  });
}
