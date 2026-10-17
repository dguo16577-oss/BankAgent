import { completeVerification } from "./verification";
import { expect as baseExpect, type Page } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 15000 });
export async function createSchedule(page: Page) {
  await page.goto("/app/payments");
  await page
    .getByRole("link", { name: "Schedule payment", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/payments\/scheduled\/new$/);
  await page
    .getByRole("combobox", { name: /^Source account/ })
    .selectOption("acc_current");
  await page
    .getByRole("combobox", { name: /^Recipient/ })
    .selectOption("recipient_zhang");
  await page.getByLabel("Amount (CNY)").fill("500");
  await page
    .getByLabel("Execution time (Asia/Shanghai, UTC+08:00)", { exact: true })
    .fill("2099-10-05T09:00");
  await page
    .getByRole("button", { name: "Review scheduled payment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm schedule", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm schedule", exact: true })
    .click();
  await completeVerification(page);
  await expect(
    page.getByRole("heading", { name: "Scheduled payment", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("SCHEDULED", { exact: true })).toBeVisible();
  await expect(page.getByText(/09:00/)).toBeVisible();
  return page.url().split("/").at(-1)!;
}
export async function scheduleJourney(
  page: Page,
  afterCreate?: () => Promise<void>,
) {
  await createSchedule(page);
  if (afterCreate) await afterCreate();
  await page
    .getByRole("link", { name: "Modify schedule", exact: true })
    .click();
  await page.getByLabel("Amount (CNY)").fill("550");
  await page
    .getByRole("button", { name: "Review scheduled payment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm schedule", exact: true })
    .click();
  await completeVerification(page);
  await expect(
    page.getByRole("heading", { name: "Scheduled payment", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/b3-scheduled-${process.env.ASTER_PACKAGED_ORIGIN ? "packaged" : "web"}-${width}.png`,
      fullPage: true,
    });
  }
  const url = page.url();
  await page
    .getByRole("button", { name: "Cancel schedule", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await completeVerification(page);
  await expect(page.getByText("Cancelled. No payment was made.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Cancelled. No payment was made.")).toBeVisible();
  await page
    .getByRole("link", { name: "Back to scheduled payments", exact: true })
    .click();
  await expect(
    page.locator(`a[href="${new URL(url).pathname}"]`),
  ).toBeVisible();
}
