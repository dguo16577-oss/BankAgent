import { overviewSpending } from "../bank/spending-analytics";
import { initialCards, summarizeCard } from "./card-fixtures";
import {
  createDemoTransactions,
  compareTransactions,
} from "./transaction-fixtures";
import type { components } from "@/generated/customer-api";
import type { Overview } from "@/lib/api/overview";
import type { AccountDetail, AccountsResponse } from "@/lib/api/accounts";

type Money = components["schemas"]["Money"];
type Transaction = components["schemas"]["TransactionSummary"];
const cny = (amount: string): Money => ({ amount, currency: "CNY" });
const cents = (amount: string) => BigInt(amount.replace(".", ""));
const decimal = (value: bigint) => {
  const digits = (value < BigInt(0) ? -value : value)
    .toString()
    .padStart(3, "0");
  return `${value < BigInt(0) ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
};
const sum = (values: string[]) =>
  decimal(values.reduce((total, value) => total + cents(value), BigInt(0)));
const percent = (current: string, previous: string) => {
  const base = cents(previous);
  if (base === BigInt(0)) return null;
  const delta = cents(current) - base;
  const absolute = delta < BigInt(0) ? -delta : delta;
  const rounded = (absolute * BigInt(10000) + base / BigInt(2)) / base;
  return decimal(delta < BigInt(0) ? -rounded : rounded);
};

// One reusable source for Session and future module mocks. Never imported by UI.
export const demoProfile = {
  user: { id: "usr_aster_alex", displayName: "Alex Chen" },
  asOf: "2026-09-27T10:30:00+08:00",
  baseCurrency: "CNY" as const,
  salary: cny("12000.00"),
  currentOpeningBalance: cny("16810.31"),
  savingsBalance: cny("8200.00"),
  usdBalance: { amount: "621.32", currency: "USD" } satisfies Money,
  usdToCnyRate: "7.10",
  conversionAsOf: "2026-09-27T10:00:00+08:00",
  accountMetadata: [
    {
      id: "acc_current",
      displayName: "CNY Current",
      type: "CURRENT",
      status: "ACTIVE",
      currency: "CNY",
      maskedAccountNumber: "•••• 1048",
      openedAt: "2022-03-15T09:00:00+08:00",
    },
    {
      id: "acc_savings",
      displayName: "Savings",
      type: "SAVINGS",
      status: "ACTIVE",
      currency: "CNY",
      maskedAccountNumber: "•••• 2086",
      openedAt: "2023-06-01T09:00:00+08:00",
    },
    {
      id: "acc_usd",
      displayName: "USD",
      type: "MULTI_CURRENCY",
      status: "ACTIVE",
      currency: "USD",
      maskedAccountNumber: "•••• 3052",
      openedAt: "2024-01-10T09:00:00+08:00",
    },
  ] satisfies Pick<
    AccountDetail,
    | "id"
    | "displayName"
    | "type"
    | "status"
    | "currency"
    | "maskedAccountNumber"
    | "openedAt"
  >[],
  recurring: [
    {
      id: "rec_rent",
      title: "Rent",
      amount: cny("3000.00"),
      dueAt: "2026-10-01T09:00:00+08:00",
      paidAt: "2026-09-01T09:00:00+08:00",
      category: "HOUSING",
    },
    {
      id: "rec_netflix",
      title: "Netflix",
      amount: cny("88.00"),
      dueAt: "2026-10-03T09:00:00+08:00",
      paidAt: "2026-09-03T09:00:00+08:00",
      category: "SUBSCRIPTIONS",
    },
    {
      id: "rec_spotify",
      title: "Spotify",
      amount: cny("65.00"),
      dueAt: "2026-10-05T09:00:00+08:00",
      paidAt: "2026-09-05T09:00:00+08:00",
      category: "SUBSCRIPTIONS",
    },
    {
      id: "rec_adobe",
      title: "Adobe",
      amount: cny("238.00"),
      dueAt: "2026-10-24T09:00:00+08:00",
      paidAt: "2026-09-24T09:00:00+08:00",
      category: "SUBSCRIPTIONS",
    },
    {
      id: "rec_chatgpt",
      title: "ChatGPT",
      amount: cny("145.00"),
      dueAt: "2026-10-10T09:00:00+08:00",
      paidAt: "2026-09-10T09:00:00+08:00",
      category: "SUBSCRIPTIONS",
    },
  ] satisfies {
    id: string;
    title: string;
    amount: Money;
    dueAt: string;
    paidAt: string;
    category: Transaction["category"];
  }[],
  cards: initialCards().map(summarizeCard),
  holdings: [
    { id: "holding_market", name: "Money Market", value: cny("10000.00") },
    { id: "holding_bond", name: "Bond Fund", value: cny("5320.00") },
    { id: "holding_cash", name: "Cash Management", value: cny("3000.00") },
  ] satisfies components["schemas"]["HoldingSummary"][],
  previousPortfolioTotal: cny("18100.00"),
  // Previous statement, not a second September purchase or September spending.
  cardBill: {
    id: "bill_previous",
    title: "Credit card bill",
    dueAt: "2026-10-08T09:00:00+08:00",
    amount: cny("1286.40"),
    type: "CARD_BILL",
  } satisfies components["schemas"]["UpcomingPayment"],
};

export const demoTransactions: Transaction[] = createDemoTransactions(
  demoProfile.recurring,
  demoProfile.salary,
);

export function getDemoAccounts(): AccountsResponse {
  const openingBalances = [
    demoProfile.currentOpeningBalance,
    demoProfile.savingsBalance,
    demoProfile.usdBalance,
  ];
  const accounts = demoProfile.accountMetadata.map(
    (
      { id, displayName, type, status, currency, maskedAccountNumber },
      index,
    ): components["schemas"]["AccountSummary"] => {
      const entries = demoTransactions.filter((item) => item.accountId === id);
      const posted = entries.filter(
        (item) =>
          item.status === "COMPLETED" &&
          item.bookedAt &&
          Date.parse(item.bookedAt) >= Date.parse("2026-09-01T00:00:00+08:00"),
      );
      const balance = {
        currency,
        amount: sum([
          openingBalances[index].amount,
          ...posted.map((item) =>
            item.direction === "DEBIT"
              ? "-" + item.amount.amount
              : item.amount.amount,
          ),
        ]),
      };
      const pendingAmount = {
        currency,
        amount: sum(
          entries
            .filter(
              (item) => item.status === "PENDING" && item.direction === "DEBIT",
            )
            .map((item) => item.amount.amount),
        ),
      };
      return {
        id,
        displayName,
        type,
        status,
        currency,
        maskedAccountNumber,
        balance,
        pendingAmount,
        availableBalance: {
          amount: decimal(cents(balance.amount) - cents(pendingAmount.amount)),
          currency: balance.currency,
        },
        ...(balance.currency !== demoProfile.baseCurrency
          ? {
              baseCurrencyEquivalent: {
                value: cny(
                  decimal(
                    (cents(balance.amount) * cents(demoProfile.usdToCnyRate) +
                      BigInt(50)) /
                      BigInt(100),
                  ),
                ),
                sourceCurrency: balance.currency,
                exchangeRate: demoProfile.usdToCnyRate,
                conversionAsOf: demoProfile.conversionAsOf,
                conversionSource: "DEMO_RATE" as const,
              },
            }
          : {}),
      };
    },
  );
  return structuredClone({
    asOf: demoProfile.asOf,
    baseCurrency: demoProfile.baseCurrency,
    accounts,
    totalBalance: cny(
      sum(
        accounts.map(
          (account) =>
            (account.baseCurrencyEquivalent?.value ?? account.balance).amount,
        ),
      ),
    ),
    exchangeEquivalents: accounts.flatMap((account) =>
      account.baseCurrencyEquivalent ? [account.baseCurrencyEquivalent] : [],
    ),
  });
}

export function getDemoAccount(id: string): AccountDetail | undefined {
  const account = getDemoAccounts().accounts.find((item) => item.id === id);
  if (!account) return undefined;
  return structuredClone({
    ...account,
    asOf: demoProfile.asOf,
    openedAt: demoProfile.accountMetadata.find((item) => item.id === id)
      ?.openedAt,
    recentTransactions: [...demoTransactions]
      .filter((item) => item.accountId === id)
      .sort(compareTransactions)
      .slice(0, 5),
  });
}

export function getDemoOverview(): Overview {
  const accountSnapshot = getDemoAccounts();
  const portfolioTotal = sum(
    demoProfile.holdings.map((item) => item.value.amount),
  );
  return structuredClone<Overview>({
    asOf: demoProfile.asOf,
    baseCurrency: demoProfile.baseCurrency,
    user: demoProfile.user,
    totalBalance: accountSnapshot.totalBalance,
    exchangeEquivalents: accountSnapshot.exchangeEquivalents,
    balanceNote: `Deposit accounts only · Demo FX: 1 USD = ${demoProfile.usdToCnyRate} CNY · Investments excluded`,
    accounts: accountSnapshot.accounts,
    spending: overviewSpending({
      transactions: demoTransactions,
      accounts: accountSnapshot.accounts,
      asOf: demoProfile.asOf,
    }),
    recentTransactions: [...demoTransactions]
      .sort(compareTransactions)
      .slice(0, 5),
    cards: demoProfile.cards,
    upcomingPayments: [
      ...demoProfile.recurring.map((item) => ({
        id: item.id,
        title: item.title,
        dueAt: item.dueAt,
        amount: item.amount,
        type: "RECURRING" as const,
      })),
      demoProfile.cardBill,
    ]
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
      .slice(0, 4),
    wealth: {
      total: cny(portfolioTotal),
      monthlyChange: cny(
        decimal(
          cents(portfolioTotal) -
            cents(demoProfile.previousPortfolioTotal.amount),
        ),
      ),
      monthlyChangePercent: percent(
        portfolioTotal,
        demoProfile.previousPortfolioTotal.amount,
      ),
      holdings: demoProfile.holdings,
    },
  });
}

export const demoSession = { user: demoProfile.user };
