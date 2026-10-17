"use client";
import { useLocale } from "@/lib/i18n/locale";
import type { components } from "@/generated/customer-api";

export const accountTypeLabels: Record<
  components["schemas"]["AccountType"],
  string
> = {
  CURRENT: "Current account",
  SAVINGS: "Savings account",
  MULTI_CURRENCY: "Multi-currency account",
  TIME_DEPOSIT: "Time deposit",
};
const statusLabels: Record<components["schemas"]["AccountStatus"], string> = {
  ACTIVE: "Active",
  RESTRICTED: "Restricted",
  FROZEN: "Frozen",
  CLOSED: "Closed",
};
export function AccountStatus({
  status,
}: {
  status: components["schemas"]["AccountStatus"];
}) {
  const { t } = useLocale();

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === "ACTIVE" ? "bg-secondary text-secondary-foreground" : "bg-amber-50 text-amber-800"}`}
    >
      {t(statusLabels[status])}
    </span>
  );
}
export function ExchangeNote({
  conversion,
}: {
  conversion: components["schemas"]["ExchangeEquivalent"];
}) {
  const { t, formatDate } = useLocale();

  return (
    <p className="text-xs leading-5 text-muted-foreground">
      1 {t(conversion.sourceCurrency)} = {t(conversion.exchangeRate)}
      {t(" ")}
      {t(conversion.value.currency)} · {t(conversion.conversionSource)}
      <br />
      {t("Rate as of")}
      {t(" ")}
      <time dateTime={conversion.conversionAsOf}>
        {t(formatDate(conversion.conversionAsOf, true))}
      </time>
      {t(" ")}
      {t("(UTC+08:00). Demo estimate, not an executable rate.")}
    </p>
  );
}
