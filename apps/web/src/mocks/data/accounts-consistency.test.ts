import { expect, it } from "vitest";
import { getAccount, getAccounts } from "@/lib/api/accounts";
import {
  demoTransactions,
  getDemoAccount,
  getDemoAccounts,
  getDemoOverview,
} from "./demo-profile";

const minor = (amount: string) => BigInt(amount.replace(".", ""));

it("shares identical account summaries and totals across Overview, list and detail", () => {
  const accounts = getDemoAccounts();
  const overview = getDemoOverview();
  expect(overview.accounts).toEqual(accounts.accounts);
  expect(overview.totalBalance).toEqual(accounts.totalBalance);
  expect(overview.exchangeEquivalents).toEqual(accounts.exchangeEquivalents);
  for (const account of accounts.accounts) {
    expect(getDemoAccount(account.id)).toMatchObject(account);
    expect(account.balance.currency).toBe(account.currency);
    expect(account.availableBalance.currency).toBe(account.currency);
    const pending = account.pendingAmount?.amount ?? "0.00";
    expect(minor(account.balance.amount) - minor(pending)).toBe(
      minor(account.availableBalance.amount),
    );
    expect(minor(pending)).toBeGreaterThanOrEqual(BigInt(0));
    expect(account.maskedAccountNumber).toMatch(/^•••• \d{4}$/);
  }
  const current = getDemoAccount("acc_current")!;
  const held = demoTransactions
    .filter((item) => item.status === "PENDING")
    .reduce((total, item) => total + minor(item.amount.amount), BigInt(0));
  expect(minor(current.pendingAmount!.amount)).toBe(held);
  expect(current.availableBalance.amount).toBe("23810.31");
  expect(current.recentTransactions).toEqual(overview.recentTransactions);
  const usd = accounts.accounts.find((item) => item.currency === "USD")!;
  expect(minor(usd.baseCurrencyEquivalent!.value.amount)).toBe(
    (minor(usd.balance.amount) * BigInt(710) + BigInt(50)) / BigInt(100),
  );
  const total = accounts.accounts.reduce(
    (value, item) =>
      value +
      minor((item.baseCurrencyEquivalent?.value ?? item.balance).amount),
    BigInt(0),
  );
  expect(total).toBe(minor(accounts.totalBalance.amount));
});

it("returns independent snapshots and no unmasked sensitive API properties", async () => {
  const accounts = await getAccounts();
  for (const account of accounts.accounts) {
    const detail = await getAccount(account.id);
    expect(detail).toMatchObject(account);
    const json = JSON.stringify(detail);
    expect(json).not.toMatch(
      /"(?:accountNumber|password|pin|cardNumber|cvv)"/i,
    );
    expect(json).not.toMatch(/\b\d{8,}\b/);
  }
  accounts.accounts[0].balance.amount = "0.00";
  expect(getDemoAccounts().accounts[0].balance.amount).toBe("23842.31");
});

it("returns a real HTTP 404 and a unified error body for unknown opaque IDs", async () => {
  const response = await fetch("/customer/accounts/unknown");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    code: "ACCOUNT_NOT_FOUND",
    message: "Account not found.",
  });
  await expect(getAccount("not/a/known id")).rejects.toMatchObject({
    name: "ApiError",
    status: 404,
    code: "ACCOUNT_NOT_FOUND",
  });
});

it("uses explicit matching MTD windows and keeps the full August trend separate", () => {
  const spending = getDemoOverview().spending!;
  expect(spending.currentPeriod).toEqual({
    periodStart: "2026-09-01T00:00:00+08:00",
    periodEnd: "2026-09-27T10:30:00+08:00",
    amount: { amount: "4968.00", currency: "CNY" },
  });
  expect(spending.comparisonPeriod).toEqual({
    periodStart: "2026-08-01T00:00:00+08:00",
    periodEnd: "2026-08-27T10:30:00+08:00",
    amount: { amount: "4800.00", currency: "CNY" },
  });
  expect(spending.changePercent).toBe("3.50");
  expect(spending.trend.at(-2)?.amount.amount).toBe("5400.00");
  expect(getDemoOverview().exchangeEquivalents?.[0]).toMatchObject({
    exchangeRate: "7.10",
    conversionAsOf: "2026-09-27T10:00:00+08:00",
    conversionSource: "DEMO_RATE",
  });
});
