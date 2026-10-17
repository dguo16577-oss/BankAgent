import { expect, it } from "vitest";
import {
  getTransaction,
  getTransactions,
  type TransactionQuery,
  type TransactionSummary,
} from "@/lib/api/transactions";
import {
  demoTransactions,
  getDemoAccount,
  getDemoAccounts,
  getDemoOverview,
} from "./demo-profile";
import { compareTransactions } from "./transaction-fixtures";

it("returns the newest page and uses unsigned magnitudes with explicit direction", async () => {
  const page = await getTransactions({});
  expect(page.items).toHaveLength(10);
  expect(page.items[0]).toMatchObject({
    title: "Starbucks",
    amount: { amount: "32.00" },
    direction: "DEBIT",
    status: "PENDING",
    bookedAt: null,
  });
  expect(page.items.find((item) => item.type === "SALARY")).toMatchObject({
    direction: "CREDIT",
    amount: { amount: "12000.00" },
  });
  expect(page.hasMore).toBe(true);
  expect(page.nextCursor).toEqual(expect.any(String));
  expect(demoTransactions.length).toBeGreaterThanOrEqual(48);
  for (const item of demoTransactions)
    expect(item.amount.amount).toMatch(/^\d+\.\d{2}$/);
});

const filterCases: [TransactionQuery, (item: TransactionSummary) => boolean][] =
  [
    [{ accountId: "acc_usd" }, (item) => item.accountId === "acc_usd"],
    [{ status: "PENDING" }, (item) => item.status === "PENDING"],
    [{ status: "REVERSED" }, (item) => item.status === "REVERSED"],
    [{ direction: "CREDIT" }, (item) => item.direction === "CREDIT"],
    [{ type: "BANK_TRANSFER" }, (item) => item.type === "BANK_TRANSFER"],
    [{ category: "DINING" }, (item) => item.category === "DINING"],
    [
      { from: "2026-09-25T00:00:00+08:00", to: "2026-09-27T00:00:00+08:00" },
      (item) =>
        Date.parse(item.occurredAt) >=
          Date.parse("2026-09-25T00:00:00+08:00") &&
        Date.parse(item.occurredAt) < Date.parse("2026-09-27T00:00:00+08:00"),
    ],
    [{ search: "  STARBUCKS " }, (item) => item.title === "Starbucks"],
    [{ search: "Jamie" }, (item) => item.counterparty?.name === "Jamie Lee"],
    [
      {
        accountId: "acc_current",
        type: "CARD_PAYMENT",
        category: "DINING",
        status: "COMPLETED",
      },
      (item) =>
        item.accountId === "acc_current" &&
        item.type === "CARD_PAYMENT" &&
        item.category === "DINING" &&
        item.status === "COMPLETED",
    ],
  ];
it.each(filterCases)(
  "applies API filters %j before pagination",
  async (query, predicate) => {
    const page = await getTransactions({ ...query, limit: 50 });
    expect(page.items).toEqual(
      demoTransactions.filter(predicate).sort(compareTransactions),
    );
    expect(page.items.length).toBeGreaterThan(0);
  },
);

it.each([{}, { category: "DINING" as const }, { accountId: "acc_usd" }])(
  "walks cursors without duplicates or omissions for %j, including tied timestamps",
  async (filters) => {
    const items: TransactionSummary[] = [];
    let cursor: string | undefined;
    do {
      const page = await getTransactions({ ...filters, limit: 2, cursor });
      items.push(...page.items);
      expect(page.hasMore).toBe(page.nextCursor !== null);
      cursor = page.nextCursor ?? undefined;
      expect(items.length).toBeLessThanOrEqual(demoTransactions.length);
    } while (cursor);
    const expected = demoTransactions
      .filter(
        (t) =>
          (!("category" in filters) || t.category === filters.category) &&
          (!("accountId" in filters) || t.accountId === filters.accountId),
      )
      .sort(compareTransactions);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items).toEqual(expected);
  },
);

it("rejects malformed, mismatched and out-of-snapshot cursors", async () => {
  await expect(
    getTransactions({ cursor: "not-a-token" }),
  ).rejects.toMatchObject({ status: 400, code: "INVALID_CURSOR" });
  const page = await getTransactions({ limit: 2 });
  await expect(
    getTransactions({ cursor: page.nextCursor!, limit: 2, category: "DINING" }),
  ).rejects.toMatchObject({ status: 400, code: "INVALID_CURSOR" });
  await expect(
    getTransactions({ cursor: page.nextCursor!, limit: 3 }),
  ).rejects.toMatchObject({ status: 400, code: "INVALID_CURSOR" });
  const token = btoa(
    JSON.stringify({ snapshot: "old", afterId: page.items[1].id, query: "{}" }),
  );
  await expect(getTransactions({ cursor: token })).rejects.toMatchObject({
    status: 400,
    code: "INVALID_CURSOR",
  });
});

it.each([
  "limit=0",
  "limit=51",
  "limit=1.5",
  "status=completed",
  "category=UNKNOWN",
  "from=2026-09-01",
  "from=2026-02-30T00:00:00Z",
  "from=2026-09-27T00:00:00Z&to=2026-09-01T00:00:00Z",
  "status=PENDING&status=COMPLETED",
  "page=1",
])("rejects invalid API query %s", async (query) => {
  const response = await fetch(`/customer/transactions?${query}`);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "INVALID_QUERY" });
});

it("returns an empty page and a true 404 for unknown transaction IDs", async () => {
  expect(await getTransactions({ search: "nothing matches this" })).toEqual({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  const response = await fetch("/customer/transactions/not-known");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    code: "TRANSACTION_NOT_FOUND",
    message: "Transaction not found.",
  });
  await expect(getTransaction("not/known")).rejects.toMatchObject({
    code: "TRANSACTION_NOT_FOUND",
    status: 404,
  });
});

it("distinguishes merchant and counterparty, preserves read model identity and masks identifiers", async () => {
  const merchant = await getTransaction("txn_coffee");
  expect(merchant.merchant).toMatchObject({
    name: "Starbucks",
    maskedCardNumber: "•••• 8821",
  });
  expect(merchant.counterparty).toBeUndefined();
  const transfer = await getTransaction("txn_history_0_07");
  expect(transfer.counterparty).toEqual({
    name: "Jamie Lee",
    maskedAccountNumber: "•••• 6702",
  });
  expect(transfer.merchant).toBeUndefined();
  const all = (await getTransactions({ limit: 50 })).items;
  for (const account of getDemoAccounts().accounts) {
    const detail = getDemoAccount(account.id)!;
    expect(detail.recentTransactions).toEqual(
      all.filter((item) => item.accountId === account.id).slice(0, 5),
    );
    const pending = all
      .filter(
        (item) =>
          item.accountId === account.id &&
          item.status === "PENDING" &&
          item.direction === "DEBIT",
      )
      .reduce(
        (sum, item) => sum + BigInt(item.amount.amount.replace(".", "")),
        BigInt(0),
      );
    expect(BigInt(account.pendingAmount!.amount.replace(".", ""))).toBe(
      pending,
    );
    expect(BigInt(account.balance.amount.replace(".", "")) - pending).toBe(
      BigInt(account.availableBalance.amount.replace(".", "")),
    );
    for (const item of detail.recentTransactions) {
      const transaction = await getTransaction(item.id);
      expect(transaction).toMatchObject(item);
      expect(transaction.account).toEqual(account);
    }
  }
  expect(getDemoOverview().recentTransactions).toEqual(all.slice(0, 5));
  expect(JSON.stringify([merchant, transfer, all])).not.toMatch(
    /"(?:cardNumber|accountNumber|cvv|pin|password|secret)"/i,
  );
  expect(JSON.stringify([merchant, transfer, all])).not.toMatch(/\b\d{8,}\b/);
});
