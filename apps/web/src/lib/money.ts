import type { components } from "@/generated/customer-api";

type Money = components["schemas"]["Money"];

export function formatTransactionAmount(
  transaction: Pick<
    components["schemas"]["TransactionSummary"],
    "amount" | "direction"
  >,
) {
  return `${transaction.direction === "DEBIT" ? "−" : "+"}${formatMoney(transaction.amount)}`;
}

// Keep decimal strings exact, including values above Number.MAX_SAFE_INTEGER.
export function formatMoney(money: Money, signed = false) {
  const negative = money.amount.startsWith("-");
  const [whole, fraction] = money.amount.replace(/^-/, "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol: Record<string, string> = {
    CNY: "¥",
    USD: "$",
    JPY: "¥",
    EUR: "€",
    GBP: "£",
    HKD: "HK$",
    AUD: "A$",
    SGD: "S$",
  };
  return `${negative ? "−" : signed ? "+" : ""}${symbol[money.currency] ?? `${money.currency} `}${grouped}.${fraction}`;
}

export function formatDate(
  timestamp: string,
  includeTime = false,
  locale = "en-GB",
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : {}),
  }).format(new Date(timestamp));
}
