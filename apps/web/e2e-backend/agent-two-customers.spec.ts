import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { completeVerification } from "../e2e-shared/verification";

const webOrigin = process.env.ASTER_E2E_WEB_ORIGIN ?? "http://localhost:3000";
const bankingOrigin =
  process.env.ASTER_E2E_BACKEND_ORIGIN ?? "http://localhost:18080";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Sign in to demo" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function balance(context: BrowserContext, accountId: string) {
  const response = await context.request.get(
    `${bankingOrigin}/customer/accounts`,
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    accounts: { id: string; balance: { amount: string } }[];
  };
  const amount = body.accounts.find((item) => item.id === accountId)?.balance
    .amount;
  expect(amount).toMatch(/^\d+\.\d{2}$/);
  return BigInt(amount!.replace(".", ""));
}

test("Agent proposal settles once between two isolated customer sessions", async ({
  browser,
}) => {
  test.skip(
    process.env.ASTER_E2E_AGENT !== "1",
    "Start the Agent Runtime with ASTER_E2E_AGENT=1.",
  );
  test.setTimeout(120_000);
  const alex = await browser.newContext({ baseURL: webOrigin });
  const lin = await browser.newContext({ baseURL: webOrigin });
  try {
    const alexPage = await alex.newPage();
    const linPage = await lin.newPage();
    await login(alexPage, "alex@aster.local");
    await login(linPage, "lin@aster.local");

    const alexBefore = await balance(alex, "acc_current");
    const linBefore = await balance(lin, "acc_lin_current");

    await alexPage.goto("/app/agent");
    await alexPage
      .getByRole("textbox", { name: "Message Aster Agent" })
      .fill("转给 Lin Wei 10 元");
    await alexPage.getByRole("button", { name: "Send message" }).click();
    await expect(
      alexPage.getByRole("button", { name: "Confirm transfer" }),
    ).toBeVisible();
    expect(await balance(alex, "acc_current")).toBe(alexBefore);
    expect(await balance(lin, "acc_lin_current")).toBe(linBefore);

    await alexPage.screenshot({
      path: "docs/screenshots/competition-agent-transfer-review-1440.png",
      fullPage: true,
    });
    expect(await balance(lin, "acc_lin_current")).toBe(linBefore);
    await alexPage.getByRole("button", { name: "Confirm transfer" }).click();
    await completeVerification(alexPage);
    await expect(
      alexPage.getByText(/^Transfer completed\. Reference:/),
    ).toBeVisible({ timeout: 30_000 });
    await alexPage.screenshot({
      path: "docs/screenshots/competition-agent-transfer-receipt-1440.png",
      fullPage: true,
    });

    expect(await balance(alex, "acc_current")).toBe(alexBefore - BigInt(1000));
    expect(await balance(lin, "acc_lin_current")).toBe(
      linBefore + BigInt(1000),
    );
    const activity = await lin.request.get(
      `${bankingOrigin}/customer/transactions?accountId=acc_lin_current`,
    );
    expect(activity.status()).toBe(200);
    const transactions = (await activity.json()) as {
      items: { direction: string; amount: { amount: string } }[];
    };
    expect(
      transactions.items.some(
        (item) => item.direction === "CREDIT" && item.amount.amount === "10.00",
      ),
    ).toBe(true);
    await alexPage.reload();
    expect(await balance(alex, "acc_current")).toBe(alexBefore - BigInt(1000));
    expect(await balance(lin, "acc_lin_current")).toBe(
      linBefore + BigInt(1000),
    );
  } finally {
    await alex.close();
    await lin.close();
  }
});
