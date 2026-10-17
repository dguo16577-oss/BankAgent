import { completeVerification } from "../e2e-shared/verification";
import { test, expect } from "./authenticated-test";
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`suitable investment, consistency and unsuitable block at ${width}px`, async ({
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
      .getByRole("link", { name: "Wealth", exact: true })
      .click();
    await expect(page.getByTestId("portfolio-total")).toHaveText("¥18,320.00");
    await fits();
    await page.getByRole("link", { name: /Aster Stable Bond/ }).click();
    await expect(
      page.getByRole("heading", { name: "Aster Stable Bond", level: 1 }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Check suitability" }).click();
    await expect(page.getByTestId("suitability-result")).toHaveText("SUITABLE");
    await fits();
    await page.getByRole("link", { name: "Invest", exact: true }).click();
    await page
      .getByLabel("Source account", { exact: true })
      .selectOption("acc_current");
    await page.getByLabel("Amount (CNY)", { exact: true }).fill("1000");
    await fits();
    await page.getByRole("button", { name: "Review investment" }).click();
    await expect(
      page.getByRole("heading", { name: "Review investment", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("¥22,810.31", { exact: true })).toBeVisible();
    await fits();
    await page.reload();
    await page.getByRole("button", { name: "Confirm investment" }).click();
    await completeVerification(page);
    await expect(
      page.getByRole("heading", { name: "Investment completed" }),
    ).toBeVisible();
    await fits();
    await page.reload();
    await expect(
      page.getByText("ASTER-INVEST-1", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "View investment transaction" })
      .click();
    await expect(page.getByTestId("transaction-amount")).toHaveText(
      "−¥1,000.00",
    );
    await expect(
      page.getByText("Investment purchase", { exact: true }),
    ).toBeVisible();
    await fits();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Wealth", exact: true })
      .click();
    await expect(page.getByTestId("portfolio-total")).toHaveText("¥19,320.00");
    await expect(
      page.getByTestId("portfolio-position").filter({ hasText: "Bond Fund" }),
    ).toContainText("¥6,320.00");
    await fits();
    await page.getByRole("link", { name: /Aster Balanced Growth/ }).click();
    await page.getByRole("button", { name: "Check suitability" }).click();
    await expect(page.getByTestId("suitability-result")).toHaveText(
      "NOT_SUITABLE",
    );
    await expect(
      page.getByRole("button", { name: "Invest unavailable" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Invest", exact: true }),
    ).toHaveCount(0);
    await fits();
    await page.goto("/app/accounts/acc_current");
    await expect(page.getByText("¥22,842.31", { exact: true })).toBeVisible();
    await fits();
    await page.goto("/app/spending");
    await expect(page.getByTestId("spending-total")).toHaveText("¥4,968.00");
    await fits();
    await page.goto("/app/overview");
    await expect(page.getByTestId("total-balance")).toHaveText("¥35,453.68");
    await expect(page.getByText("¥19,320.00", { exact: true })).toBeVisible();
    await fits();
  });
}
