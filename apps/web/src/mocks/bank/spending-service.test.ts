import { verifiedIntent, authorizationFor } from "@/test/verification";
import { expect, it } from "vitest";
import { bankingStore, minor } from "./store";
import {
  spendingSummary,
  eligibleSpending,
  previousMonth,
} from "./spending-analytics";
import { getSpending } from "@/lib/api/spending";
import { TransferService } from "./transfer-service";
import type { components } from "@/generated/customer-api";
import { readFilters } from "@/features/transactions/filter-state";
type S = components["schemas"];
it("keeps a valid comparison when a custom month-end range clamps to one day", async () => {
  const result = await getSpending({
    from: "2026-03-30T00:00:00+08:00",
    to: "2026-03-31T00:00:00+08:00",
  });
  expect(result.comparisonPeriod).toEqual({
    from: "2026-02-28T00:00:00+08:00",
    to: "2026-03-01T00:00:00+08:00",
  });
});
it("derives exact default comparison and six-month Overview from the same transactions", async () => {
  const result = await getSpending({});
  expect(result.period).toEqual({
    from: "2026-09-01T00:00:00+08:00",
    to: "2026-09-27T10:30:00+08:00",
  });
  expect(result.comparisonPeriod).toEqual({
    from: "2026-08-01T00:00:00+08:00",
    to: "2026-08-27T10:30:00+08:00",
  });
  expect(result.totalSpend.amount).toBe("4968.00");
  expect(result.comparisonTotalSpend.amount).toBe("4800.00");
  expect(result.absoluteChange.amount).toBe("168.00");
  expect(result.percentageChange).toBe("3.50");
  expect(result.transactionCount).toBe(10);
  const overview = bankingStore.overview().spending!;
  expect(overview.currentPeriod.amount).toEqual(result.totalSpend);
  expect(overview.comparisonPeriod.amount).toEqual(result.comparisonTotalSpend);
  expect(overview.trend.map((t) => t.amount.amount)).toEqual([
    "4620.00",
    "5180.00",
    "4890.00",
    "5620.00",
    "5400.00",
    "4968.00",
  ]);
});
const rules: [
  S["TransactionType"],
  S["TransactionStatus"],
  S["TransactionDirection"],
  boolean,
][] = [
  ["CARD_PAYMENT", "COMPLETED", "DEBIT", true],
  ["DIRECT_DEBIT", "COMPLETED", "DEBIT", true],
  ["FEE", "COMPLETED", "DEBIT", true],
  ["BANK_TRANSFER", "COMPLETED", "DEBIT", false],
  ["CASH_WITHDRAWAL", "COMPLETED", "DEBIT", false],
  ["FX_EXCHANGE", "COMPLETED", "DEBIT", false],
  ["INTEREST", "COMPLETED", "DEBIT", false],
  ["SALARY", "COMPLETED", "DEBIT", false],
  ["CARD_PAYMENT", "PENDING", "DEBIT", false],
  ["CARD_PAYMENT", "REVERSED", "DEBIT", false],
  ["CARD_PAYMENT", "FAILED", "DEBIT", false],
  ["CARD_PAYMENT", "CANCELLED", "DEBIT", false],
  ["CARD_PAYMENT", "COMPLETED", "CREDIT", false],
];
it.each(rules)(
  "eligibility %s %s %s = %s",
  (type, status, direction, expected) => {
    const state = bankingStore.read();
    const entry = { ...state.transactions[0], type, status, direction };
    expect(eligibleSpending(entry)).toBe(expected);
    state.transactions = [entry];
    expect(spendingSummary(state).totalSpend.amount).toBe(
      expected ? "32.00" : "0.00",
    );
    expect(eligibleSpending({ ...entry, category: "TRANSFER" })).toBe(false);
  },
);
it("aggregates categories, merchants and daily buckets exactly without counterparty leakage", () => {
  const summary = spendingSummary(bankingStore.read());
  expect(
    summary.categoryBreakdown.find((c) => c.category === "DINING"),
  ).toMatchObject({
    amount: { amount: "420.00" },
    transactionCount: 1,
    percentage: "8.45",
  });
  expect(
    summary.topMerchants.find((m) => m.merchantName === "Netflix"),
  ).toMatchObject({ amount: { amount: "88.00" }, transactionCount: 1 });
  expect(summary.topMerchants.map((m) => m.merchantName)).not.toContain("Rent");
  expect(summary.topMerchants.map((m) => m.merchantName)).not.toContain(
    "Morgan Wu",
  );
  expect(summary.trend).toHaveLength(27);
  for (const rows of [summary.trend, summary.categoryBreakdown])
    expect(
      rows.reduce((sum, r) => sum + minor(r.amount.amount), BigInt(0)),
    ).toBe(minor(summary.totalSpend.amount));
  expect(summary.trend.at(-1)?.amount.amount).toBe("0.00");
});
it("uses inclusive/exclusive custom boundaries, explicit comparison and precise drilldown URL", async () => {
  const params = {
    from: "2026-09-26T08:10:00+08:00",
    to: "2026-09-26T18:42:00+08:00",
    compareFrom: "2026-08-01T00:00:00+08:00",
    compareTo: "2026-08-02T00:00:00+08:00",
  };
  const result = await getSpending(params);
  expect(result.totalSpend.amount).toBe("18.00");
  expect(result.period).toEqual({ from: params.from, to: params.to });
  expect(result.comparisonTotalSpend.amount).toBe("3000.00");
  expect(
    readFilters(
      new URLSearchParams({
        category: "DINING",
        from: params.from,
        to: params.to,
      }),
    ).filters,
  ).toMatchObject({ from: params.from, to: params.to, category: "DINING" });
});
it("scopes by original currency without mixing USD and CNY or inventing FX estimates", async () => {
  const params = {
    from: "2026-08-01T00:00:00+08:00",
    to: "2026-09-01T00:00:00+08:00",
  };
  expect((await getSpending(params)).totalSpend).toEqual({
    amount: "5400.00",
    currency: "CNY",
  });
  const usd = await getSpending({ ...params, accountId: "acc_usd" });
  expect(usd.totalSpend).toEqual({ amount: "187.00", currency: "USD" });
  expect(usd.accountIds).toEqual(["acc_usd"]);
  expect(usd.percentageChange).toBeNull();
  expect(previousMonth("2026-03-31T10:30:00+08:00")).toBe(
    "2026-02-28T10:30:00+08:00",
  );
});
it.each([
  "from=2026-09-01",
  "from=x&to=y",
  "from=2026-02-30T00%3A00%3A00Z&to=2026-03-02T00%3A00%3A00Z",
  "compareFrom=x",
  "accountId=",
  "page=2",
  "accountId=a&accountId=b",
  "from=2026-01-02T00%3A00%3A00Z&to=2026-01-01T00%3A00%3A00Z",
  "from=2020-01-01T00%3A00%3A00Z&to=2026-01-01T00%3A00%3A00Z",
])("rejects invalid analytics query %s", async (params) => {
  const response = await fetch(`/customer/spending/summary?${params}`);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "INVALID_QUERY" });
});
it("returns unknown account 404 and meaningful empty summaries", async () => {
  await expect(getSpending({ accountId: "missing" })).rejects.toMatchObject({
    status: 404,
    code: "ACCOUNT_NOT_FOUND",
  });
  const state = bankingStore.read();
  state.transactions = [];
  const result = spendingSummary(state);
  expect(result.totalSpend.amount).toBe("0.00");
  expect(result.percentageChange).toBeNull();
  expect(result.categoryBreakdown).toEqual([]);
  expect(result.topMerchants).toEqual([]);
});
it("excludes a new 500 CNY transfer while preserving Transaction visibility and pending math", async () => {
  const before = spendingSummary(bankingStore.read());
  const service = new TransferService(bankingStore);
  const intent = await verifiedIntent(
    service.prepare({
      sourceAccountId: "acc_current",
      recipientId: "recipient_zhang",
      amount: { amount: "500.00", currency: "CNY" },
    }),
  );
  service.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "m6-transfer",
  );
  const state = bankingStore.read();
  expect(
    state.transactions.some(
      (t) => t.type === "BANK_TRANSFER" && t.amount.amount === "500.00",
    ),
  ).toBe(true);
  expect(spendingSummary(state).totalSpend).toEqual(before.totalSpend);
  expect(bankingStore.overview().spending?.currentPeriod.amount).toEqual(
    before.totalSpend,
  );
  for (const account of state.accounts) {
    const pending = state.transactions
      .filter(
        (t) =>
          t.accountId === account.id &&
          t.status === "PENDING" &&
          t.direction === "DEBIT",
      )
      .reduce((sum, t) => sum + minor(t.amount.amount), BigInt(0));
    expect(minor(account.pendingAmount!.amount)).toBe(pending);
    expect(minor(account.balance.amount) - pending).toBe(
      minor(account.availableBalance.amount),
    );
  }
});
