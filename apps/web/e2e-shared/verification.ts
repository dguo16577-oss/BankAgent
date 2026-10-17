import { expect, type Page } from "@playwright/test";
export async function completeVerification(page: Page) {
  const flow = page.getByTestId("action-verification");
  await expect(
    flow.getByRole("heading", { name: /Verify this action|验证本次操作/ }),
  ).toBeVisible();
  const original = page.url();
  const password = flow.locator('input[type="password"]');
  if (await password.count()) await password.fill("demo-password");
  const code = flow.locator('input[autocomplete="one-time-code"]');
  if (await code.count()) {
    await flow
      .getByRole("button", { name: /View simulated SMS|查看模拟短信/ })
      .click();
    const sms = flow.getByRole("status");
    await expect(sms).toContainText(/\b[0-9]{6}\b/);
    await code.fill((await sms.innerText()).match(/\b[0-9]{6}\b/)![0]);
  }
  expect(page.url()).toBe(original);
  await flow
    .getByRole("button", { name: /Verify and continue|验证并继续/ })
    .click();
}
