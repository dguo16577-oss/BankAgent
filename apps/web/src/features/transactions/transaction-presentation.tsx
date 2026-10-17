"use client";
import { useLocale } from "@/lib/i18n/locale";
import { statuses } from "@/lib/transaction-options";
import type { TransactionSummary } from "@/lib/api/transactions";

export function TransactionStatus({
  status,
}: Pick<TransactionSummary, "status">) {
  const { t } = useLocale();

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${status === "COMPLETED" ? "bg-secondary text-secondary-foreground" : status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}
    >
      {t(statuses[status])}
    </span>
  );
}
