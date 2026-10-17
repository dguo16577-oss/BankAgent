import { attributeCard } from "./card-fixtures";
import type { components } from "@/generated/customer-api";
import type { TransactionSummary } from "@/lib/api/transactions";

type Money = components["schemas"]["Money"];
type Recurring = Pick<TransactionSummary, "title" | "category"> & {
  id: string;
  amount: Money;
  paidAt: string;
};
const cny = (amount: string): Money => ({ amount, currency: "CNY" });
const merchant = (name: string): components["schemas"]["MerchantSummary"] => ({
  id: `merchant_${name.toLowerCase().replaceAll(" ", "_")}`,
  name,
  maskedCardNumber: "•••• 8821",
  location: "Shanghai, CN",
});

// This is a deterministic selected history, not a complete pre-September ledger.
// Pre-September balances are included in the profile's opening snapshot.
const historySeeds: [
  string,
  string,
  TransactionSummary["type"],
  TransactionSummary["category"],
  TransactionSummary["direction"],
][] = [
  ["Bookshop", "68.00", "CARD_PAYMENT", "SHOPPING", "DEBIT"],
  ["Cinema", "95.00", "CARD_PAYMENT", "ENTERTAINMENT", "DEBIT"],
  ["City Pharmacy", "42.50", "CARD_PAYMENT", "HEALTH", "DEBIT"],
  ["Airport Express", "50.00", "CARD_PAYMENT", "TRAVEL", "DEBIT"],
  ["ATM withdrawal", "200.00", "CASH_WITHDRAWAL", "OTHER", "DEBIT"],
  ["Service fee", "5.00", "FEE", "OTHER", "DEBIT"],
  ["Interest credit", "12.00", "INTEREST", "INCOME", "CREDIT"],
  ["From Jamie Lee", "150.00", "BANK_TRANSFER", "TRANSFER", "CREDIT"],
  ["To Morgan Wu", "100.00", "BANK_TRANSFER", "TRANSFER", "DEBIT"],
  ["Currency exchange", "120.00", "FX_EXCHANGE", "TRANSFER", "CREDIT"],
  ["Starbucks", "38.00", "CARD_PAYMENT", "DINING", "DEBIT"],
  ["Fresh Market", "76.00", "CARD_PAYMENT", "GROCERIES", "DEBIT"],
];

export function createDemoTransactions(
  recurring: Recurring[],
  salary: Money,
): TransactionSummary[] {
  const make = (
    id: string,
    title: string,
    amount: Money,
    category: TransactionSummary["category"],
    occurredAt: string,
    type: TransactionSummary["type"] = "CARD_PAYMENT",
    direction: TransactionSummary["direction"] = "DEBIT",
    status: TransactionSummary["status"] = "COMPLETED",
  ): TransactionSummary => ({
    id,
    accountId: "acc_current",
    title,
    amount,
    category,
    occurredAt,
    type,
    direction,
    status,
    bookedAt:
      status === "COMPLETED" || status === "REVERSED" ? occurredAt : null,
    ...(type === "CARD_PAYMENT" ? { merchant: merchant(title) } : {}),
    ...(type === "BANK_TRANSFER"
      ? {
          counterparty: {
            name: title.includes("Jamie") ? "Jamie Lee" : "Morgan Wu",
            maskedAccountNumber: "•••• 6702",
          },
        }
      : {}),
  });
  const current = [
    make(
      "txn_coffee",
      "Starbucks",
      cny("32.00"),
      "DINING",
      "2026-09-27T09:15:00+08:00",
      "CARD_PAYMENT",
      "DEBIT",
      "PENDING",
    ),
    make(
      "txn_groceries",
      "Fresh Market",
      cny("186.50"),
      "GROCERIES",
      "2026-09-26T18:42:00+08:00",
    ),
    make(
      "txn_metro",
      "Metro Transit",
      cny("18.00"),
      "TRANSPORT",
      "2026-09-26T08:10:00+08:00",
    ),
    make(
      "txn_salary",
      "Monthly salary",
      salary,
      "INCOME",
      "2026-09-25T09:00:00+08:00",
      "SALARY",
      "CREDIT",
    ),
    ...recurring.map((item) =>
      make(
        `txn_${item.id}`,
        item.title,
        item.amount,
        item.category,
        item.paidAt,
        item.id == "rec_rent" ? "DIRECT_DEBIT" : "CARD_PAYMENT",
      ),
    ),
    make(
      "txn_early_groceries",
      "Weekly groceries",
      cny("595.50"),
      "GROCERIES",
      "2026-09-20T14:00:00+08:00",
    ),
    make(
      "txn_dinner",
      "Family dinner",
      cny("420.00"),
      "DINING",
      "2026-09-18T19:00:00+08:00",
    ),
    make(
      "txn_transport",
      "Transport pass",
      cny("212.00"),
      "TRANSPORT",
      "2026-09-02T08:00:00+08:00",
    ),
  ];
  const historical = ["acc_current", "acc_savings", "acc_usd"].flatMap(
    (accountId, accountIndex) =>
      historySeeds.map(([title, amount, type, category, direction], index) => {
        const day = String(24 - Math.floor(index / 2)).padStart(2, "0"); // Intentional timestamp ties exercise stable pagination.
        const status: TransactionSummary["status"] =
          index === 1
            ? "FAILED"
            : index === 2
              ? "CANCELLED"
              : index === 3
                ? "REVERSED"
                : "COMPLETED";
        const item = make(
          `txn_history_${accountIndex}_${String(index).padStart(2, "0")}`,
          title,
          { amount, currency: accountId === "acc_usd" ? "USD" : "CNY" },
          category,
          `2026-08-${day}T12:00:00+08:00`,
          type,
          direction,
          status,
        );
        return { ...item, accountId };
      }),
  );
  // Historical rows reconcile the original dashboard statement totals. They
  // are already included in September opening balances, never reposted.
  const analyticsHistory = [
    ...recurring.map((item) =>
      make(
        `txn_aug_${item.id}`,
        item.title,
        item.amount,
        item.category,
        item.paidAt.replace("2026-09", "2026-08"),
        item.id === "rec_rent" ? "DIRECT_DEBIT" : "CARD_PAYMENT",
      ),
    ),
    make(
      "txn_aug_household",
      "Home supplies",
      cny("890.00"),
      "SHOPPING",
      "2026-08-15T12:00:00+08:00",
    ),
    make(
      "txn_aug_late",
      "Home supplies",
      cny("600.00"),
      "SHOPPING",
      "2026-08-28T12:00:00+08:00",
    ),
    make(
      "txn_jul_bookshop",
      "Bookshop",
      cny("68.00"),
      "SHOPPING",
      "2026-07-24T12:00:00+08:00",
    ),
    make(
      "txn_jun_bookshop",
      "Bookshop",
      cny("68.00"),
      "SHOPPING",
      "2026-06-24T12:00:00+08:00",
    ),
    ...[
      ["04", "4620.00"],
      ["05", "5180.00"],
      ["06", "4822.00"],
      ["07", "5552.00"],
    ].map(([month, amount]) =>
      make(
        `txn_housing_${month}`,
        "Housing and utilities",
        cny(amount),
        "HOUSING",
        `2026-${month}-01T09:00:00+08:00`,
        "DIRECT_DEBIT",
      ),
    ),
  ];
  return [...current, ...historical, ...analyticsHistory].map(attributeCard);
}

export function compareTransactions(
  a: TransactionSummary,
  b: TransactionSummary,
) {
  return (
    Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
