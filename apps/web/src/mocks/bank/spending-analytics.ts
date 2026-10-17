import type { components } from "@/generated/customer-api";
import { isOffsetTime } from "@/lib/offset-time";
import { decimal, minor, percentage } from "./amount";
import { fail } from "./service-support";
type S = components["schemas"];
type Input = {
  transactions: S["TransactionSummary"][];
  accounts: S["AccountSummary"][];
  asOf: string;
};
const dayMs = 86400000;
export function eligibleSpending(t: S["TransactionSummary"]) {
  return (
    t.status === "COMPLETED" &&
    t.direction === "DEBIT" &&
    t.category !== "TRANSFER" &&
    t.category !== "INVESTMENT" &&
    ["CARD_PAYMENT", "DIRECT_DEBIT", "FEE"].includes(t.type)
  );
}
function localDate(value: string) {
  return new Date(Date.parse(value) + 8 * 3600000);
}
function localIso(value: Date) {
  return value.toISOString().replace(".000Z", "+08:00").replace("Z", "+08:00");
}
export function previousMonth(value: string) {
  const date = localDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return localIso(date);
}
export function defaultSpendingPeriod(asOf: string): S["SpendingPeriod"] {
  const date = localDate(asOf);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return { from: localIso(date), to: asOf };
}
export function spendingSummary(
  input: Input,
  params = new URLSearchParams(),
): S["SpendingSummary"] {
  for (const key of params.keys()) {
    if (
      !["from", "to", "compareFrom", "compareTo", "accountId"].includes(key) ||
      params.getAll(key).length !== 1 ||
      !params.get(key)
    )
      fail(
        "INVALID_QUERY",
        400,
        "Unsupported, empty or repeated spending query.",
      );
  }
  if (
    params.has("from") !== params.has("to") ||
    params.has("compareFrom") !== params.has("compareTo")
  )
    fail("INVALID_QUERY", 400, "Supply both boundaries of each period.");
  const period = params.has("from")
    ? { from: params.get("from")!, to: params.get("to")! }
    : defaultSpendingPeriod(input.asOf);
  for (const value of [
    period.from,
    period.to,
    params.get("compareFrom"),
    params.get("compareTo"),
  ].filter((v): v is string => v !== null))
    if (!isOffsetTime(value))
      fail("INVALID_QUERY", 400, "Use valid ISO 8601 timestamps with offsets.");
  const comparisonPeriod = {
    from: params.get("compareFrom") ?? previousMonth(period.from),
    to: params.get("compareTo") ?? previousMonth(period.to),
  };
  // Two distinct end-of-month dates can clamp to the same previous-month
  // day. In that case compare the remainder of that final local day.
  if (
    !params.has("compareTo") &&
    Date.parse(comparisonPeriod.to) <= Date.parse(comparisonPeriod.from)
  ) {
    const end = localDate(comparisonPeriod.from);
    end.setUTCHours(24, 0, 0, 0);
    comparisonPeriod.to = localIso(end);
  }
  for (const window of [period, comparisonPeriod]) {
    const length = Date.parse(window.to) - Date.parse(window.from);
    if (length <= 0 || length > 366 * dayMs)
      fail(
        "INVALID_QUERY",
        400,
        "Periods must be positive and no longer than 366 days.",
      );
  }
  const accountId = params.get("accountId");
  const account = input.accounts.find((a) => a.id === accountId);
  if (accountId && !account)
    fail("ACCOUNT_NOT_FOUND", 404, "Account not found.");
  const currency = account?.currency ?? "CNY";
  const accountIds = input.accounts
    .filter((a) => (account ? a.id === account.id : a.currency === currency))
    .map((a) => a.id);
  const candidates = input.transactions.filter(
    (t) =>
      accountIds.includes(t.accountId) &&
      t.amount.currency === currency &&
      eligibleSpending(t),
  );
  const inPeriod = (t: S["TransactionSummary"], window: S["SpendingPeriod"]) =>
    Date.parse(t.occurredAt) >= Date.parse(window.from) &&
    Date.parse(t.occurredAt) < Date.parse(window.to);
  const entries = candidates.filter((t) => inPeriod(t, period));
  const sum = (items: S["TransactionSummary"][]) =>
    items.reduce((n, t) => n + minor(t.amount.amount), BigInt(0));
  const money = (n: bigint): S["Money"] => ({ amount: decimal(n), currency });
  const total = sum(entries),
    comparison = sum(candidates.filter((t) => inPeriod(t, comparisonPeriod)));
  const categories = [...new Set(entries.map((t) => t.category))].sort();
  const merchants = [
    ...new Set(entries.flatMap((t) => (t.merchant ? [t.merchant.id] : []))),
  ].sort();
  const trend: S["SpendingTrendPoint"][] = [];
  for (let start = Date.parse(period.from); start < Date.parse(period.to);) {
    const nextMidnight = localDate(new Date(start).toISOString());
    nextMidnight.setUTCHours(24, 0, 0, 0);
    const end = Math.min(
      Date.parse(localIso(nextMidnight)),
      Date.parse(period.to),
    );
    const window = {
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
    };
    const daily = entries.filter((t) => inPeriod(t, window));
    trend.push({
      period: window,
      amount: money(sum(daily)),
      transactionCount: daily.length,
    });
    start = end;
  }
  return {
    period,
    comparisonPeriod,
    currency,
    accountIds,
    asOf: input.asOf,
    totalSpend: money(total),
    comparisonTotalSpend: money(comparison),
    absoluteChange: money(total - comparison),
    percentageChange: percentage(total - comparison, comparison),
    transactionCount: entries.length,
    categoryBreakdown: categories.map((category) => {
      const rows = entries.filter((t) => t.category === category);
      const amount = sum(rows);
      return {
        category,
        amount: money(amount),
        percentage: percentage(amount, total) ?? "0.00",
        transactionCount: rows.length,
      };
    }),
    topMerchants: merchants
      .map((id) => {
        const rows = entries.filter((t) => t.merchant?.id === id);
        return {
          merchantId: id,
          merchantName: rows[0].merchant!.name,
          amount: money(sum(rows)),
          transactionCount: rows.length,
        };
      })
      .sort((a, b) =>
        minor(a.amount.amount) > minor(b.amount.amount)
          ? -1
          : minor(a.amount.amount) < minor(b.amount.amount)
            ? 1
            : a.merchantId.localeCompare(b.merchantId),
      ),
    trend,
  };
}
export function overviewSpending(input: Input): S["OverviewSpendingSummary"] {
  const summary = spendingSummary(input);
  const trend: S["OverviewSpendingTrendPoint"][] = [];
  let end = summary.period.to,
    start = summary.period.from;
  for (let index = 0; index < 6; index++) {
    const point = spendingSummary(
      input,
      new URLSearchParams({ from: start, to: end }),
    );
    trend.unshift({ periodStart: start, amount: point.totalSpend });
    end = start;
    start = previousMonth(start);
  }
  return {
    currentPeriod: {
      periodStart: summary.period.from,
      periodEnd: summary.period.to,
      amount: summary.totalSpend,
    },
    comparisonPeriod: {
      periodStart: summary.comparisonPeriod.from,
      periodEnd: summary.comparisonPeriod.to,
      amount: summary.comparisonTotalSpend,
    },
    changePercent: summary.percentageChange,
    trend,
  };
}
