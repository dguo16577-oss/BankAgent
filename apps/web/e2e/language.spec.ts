import { completeVerification } from "../e2e-shared/verification";
import { test, expect } from "./authenticated-test";

for (const width of [320, 390, 1440]) {
  test(`Chinese and English navigation, persistence and layouts at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 960 });
    await page
      .getByRole("combobox", { name: "Language / 语言" })
      .selectOption("zh-CN");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.screenshot({
      path: `test-results/i18n-overview-${width}.png`,
      fullPage: true,
    });
    await expect(
      page.getByRole("link", { name: "查看全部账户", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "查看全部账户", exact: true }).click();
    await expect(page.getByTestId("accounts-total")).toHaveText("¥36,453.68");
    await page.getByText("CNY Current", { exact: true }).click();
    await expect(page.getByTestId("available-balance")).toHaveText(
      "¥23,810.31",
    );
    for (const [route, heading] of [
      ["/app/transactions", "交易记录"],
      ["/app/payments", "付款"],
      ["/app/cards", "银行卡"],
      ["/app/spending", "支出"],
      ["/app/wealth", "财富"],
      ["/app/settings", "设置"],
      ["/banking", "银行服务"],
      ["/support", "帮助与支持"],
    ]) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }).first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto("/app/settings");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "设置", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/i18n-settings-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("combobox", { name: "Language / 语言" })
      .last()
      .selectOption("en");
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(errors).toEqual([]);
  });
}

test("language changes preserve transfer inputs and reviewed financial values", async ({
  page,
}) => {
  await page.goto("/app/payments/transfers/new");
  await page
    .getByLabel("Source account", { exact: true })
    .selectOption("acc_current");
  await page
    .getByLabel("Recipient", { exact: true })
    .selectOption("recipient_zhang");
  await page.getByLabel("Amount (CNY)", { exact: true }).fill("500");
  await page.getByLabel("Note (optional)", { exact: true }).fill("Transfer");
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("zh-CN");
  await expect(page.getByLabel("金额（人民币）", { exact: true })).toHaveValue(
    "500",
  );
  await expect(page.getByLabel("备注（可选）", { exact: true })).toHaveValue(
    "Transfer",
  );
  await page.getByRole("button", { name: "审核转账", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "审核转账", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("¥23,310.31", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("en");
  await page
    .getByRole("button", { name: "Confirm transfer", exact: true })
    .click();
  await completeVerification(page);
  await expect(page.getByTestId("receipt-amount")).toHaveText("¥500.00");
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("zh-CN");
  await expect(
    page.getByRole("heading", { name: "转账已完成", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("receipt-amount")).toHaveText("¥500.00");
});

test("Chinese login and invalid credential feedback retain language", async ({
  page,
}) => {
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("zh-CN");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "欢迎来到 Aster" }),
  ).toBeVisible();
  await page.getByLabel("邮箱", { exact: true }).fill("unknown@example.test");
  await page.getByLabel("密码", { exact: true }).fill("invalid-demo-password");
  await page.getByRole("button", { name: "登录演示账户", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "邮箱或密码不正确" }),
  ).toHaveText("邮箱或密码不正确。");
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("en");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "unknown@example.test",
  );
});
