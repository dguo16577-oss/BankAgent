import { completeVerification } from "./verification";
import { expect as baseExpect, type Page } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 15000 });
export async function recipientJourney(page: Page) {
  await page.goto("/app/payments");
  await page.getByRole("link", { name: "Add recipient", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/payments\/recipients\/new$/);
  await page.getByLabel("Demo destination reference").fill("demo-lin");
  await page
    .getByRole("button", { name: "Review recipient", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Lin Wei" })).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm recipient", exact: true })
    .click();
  await completeVerification(page);
  await expect(
    page.getByText("Recipient saved", { exact: true }),
  ).toBeVisible();
  const detail = await page
    .getByRole("link", { name: "Recipient details" })
    .getAttribute("href");
  await page.getByRole("link", { name: "Make transfer" }).click();
  await expect(
    page.getByLabel("Recipient", { exact: true }).locator("option:checked"),
  ).toContainText("Lin Wei");
  await page.getByLabel("Source account").selectOption("acc_current");
  await page.getByLabel("Amount (CNY)").fill("10");
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm transfer", exact: true })
    .click();
  await completeVerification(page);
  await expect(
    page.getByRole("heading", { name: "Transfer completed" }),
  ).toBeVisible();
  const receipt = page.url();
  await page.goto(detail!);
  await expect(page.getByRole("link", { name: "Make transfer" })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/b2-recipient-${process.env.ASTER_PACKAGED_ORIGIN ? "packaged" : "web"}-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Deactivate recipient", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm deactivation", exact: true })
    .click();
  await completeVerification(page);
  await expect(
    page.getByText("Recipient deactivated. Past transfers remain available."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Make transfer" })).toHaveCount(
    0,
  );
  await page.goto("/app/payments/transfers/new");
  await expect(
    page.getByLabel("Recipient", { exact: true }).locator("option"),
  ).not.toContainText(["Lin Wei"]);
  await page.goto(receipt);
  await expect(
    page.getByRole("heading", { name: "Transfer completed" }),
  ).toBeVisible();
  await expect(page.getByTestId("receipt-amount")).toHaveText("¥10.00");
}
