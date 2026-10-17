import { completeVerification } from "../e2e-shared/verification";
import { test, expect } from "./authenticated-test";
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`freeze, protective controls and blocked step-up at ${width}px`, async ({
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
      .getByRole("link", { name: "Cards", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Cards", exact: true }),
    ).toBeVisible();
    await fits();
    await page.getByRole("link", { name: /Visa Debit/ }).click();
    await expect(
      page.getByRole("heading", { name: "Visa Debit", exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("card-status")).toHaveText("ACTIVE");
    await expect(page.getByText("Starbucks", { exact: true })).toBeVisible();
    await fits();
    await page.getByRole("button", { name: "Freeze card" }).click();
    await expect(
      page.getByRole("heading", { name: "Review card action" }),
    ).toBeVisible();
    await expect(page.getByTestId("risk-direction")).toHaveText("PROTECTIVE");
    await expect(page.getByTestId("card-change").first()).toContainText(
      "ACTIVE",
    );
    await expect(page.getByTestId("card-change").first()).toContainText(
      "FROZEN",
    );
    await fits();
    const reviewUrl = page.url();
    await page.reload();
    await page.getByRole("button", { name: "Confirm card action" }).click();
    await expect(
      page.getByRole("heading", { name: "Card action completed" }),
    ).toBeVisible();
    await expect(page.getByTestId("card-status")).toHaveText("FROZEN");
    await fits();
    await page.reload();
    await page.getByRole("link", { name: "View card", exact: true }).click();
    await expect(page.getByTestId("card-status")).toHaveText("FROZEN");
    await expect(page.getByText("Starbucks", { exact: true })).toBeVisible();
    await page.getByRole("switch", { name: "Online payments" }).uncheck();
    await expect(page.getByText("Saved: ON", { exact: true })).toHaveCount(4);
    await page.getByRole("button", { name: "Review control changes" }).click();
    await expect(page.getByTestId("risk-direction")).toHaveText("PROTECTIVE");
    await expect(
      page.getByTestId("card-change").filter({ hasText: "Online payments" }),
    ).toContainText("OFF");
    await fits();
    await page.getByRole("button", { name: "Confirm card action" }).click();
    await completeVerification(page);
    await page.getByRole("link", { name: "View card", exact: true }).click();
    await expect(
      page.getByRole("switch", { name: "Online payments" }),
    ).not.toBeChecked();
    await expect(page.getByText("Saved: OFF", { exact: true })).toBeVisible();
    await page.getByRole("switch", { name: "Online payments" }).check();
    await page.getByRole("button", { name: "Review control changes" }).click();
    await page.getByRole("button", { name: "Confirm card action" }).click();
    await expect(page.getByLabel("Account password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Verify and continue" }),
    ).toBeDisabled();
    await fits();
    await page.getByRole("link", { name: "Back to card" }).click();
    await expect(
      page.getByRole("switch", { name: "Online payments" }),
    ).not.toBeChecked();
    await page.getByRole("button", { name: "Unfreeze card" }).click();
    await page.getByRole("button", { name: "Confirm card action" }).click();
    await expect(page.getByLabel("Account password")).toBeVisible();
    await expect(page.getByLabel("SMS verification code")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Verify and continue" }),
    ).toBeDisabled();
    await expect(page).toHaveURL(/cards\/card_aster_debit\/actions\/review/);
    await page.goto("/app/accounts/acc_current");
    await expect(page.getByText("¥23,842.31", { exact: true })).toBeVisible();
    await expect(page.getByText("¥23,810.31", { exact: true })).toBeVisible();
    await expect(page.getByText("¥32.00", { exact: true })).toBeVisible();
    await page.goto("/app/overview");
    await expect(page.getByTestId("total-balance")).toHaveText("¥36,453.68");
    await expect(page.getByText("¥4,968.00", { exact: true })).toBeVisible();
    await expect(page.getByText("¥18,320.00", { exact: true })).toBeVisible();
    await page.goto(reviewUrl);
    await page.getByRole("button", { name: "View action receipt" }).click();
    await expect(
      page.getByRole("heading", { name: "Card action completed" }),
    ).toBeVisible();
  });
}
test("card activity link applies cardId and unknown resources show 404", async ({
  page,
}) => {
  await page.goto("/app/cards/card_aster_debit");
  await page.getByRole("link", { name: "View all card activity" }).click();
  await expect(page).toHaveURL(/cardId=card_aster_debit/);
  await expect(page.getByTestId("transaction-row").first()).toContainText(
    "Starbucks",
  );
  await page.reload();
  await expect(page.getByLabel("Active filters")).toContainText(
    "card_aster_debit",
  );
  for (const route of [
    "/app/cards/missing",
    "/app/cards/card_aster_debit/actions/review/missing",
    "/app/cards/card_aster_debit/actions/missing",
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: /Card (action )?not found/ }),
    ).toBeVisible();
  }
});
