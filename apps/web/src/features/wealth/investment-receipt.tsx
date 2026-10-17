"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { useInvestmentOrder } from "./use-wealth";
import { Panel, Fields, WealthError } from "./wealth-ui";
export function InvestmentReceipt({ orderId }: { orderId: string }) {
  const { t, formatDate } = useLocale();

  const query = useInvestmentOrder(orderId);
  if (query.isPending)
    return <p role="status">{t("Loading investment receipt…")}</p>;
  if (query.isError)
    return (
      <WealthError error={query.error} retry={() => void query.refetch()} />
    );
  const order = query.data;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {t("Simulated order")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {t("Investment completed")}
        </h1>
      </header>
      <Panel title={order.product.displayName}>
        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          {t(order.status)}
        </span>
        <Fields
          items={[
            ["Amount", formatMoney(order.amount)],
            ["Fee", formatMoney(order.fees)],
            ["Total debit", formatMoney(order.totalDebit)],
            [
              "Source account",
              `${order.sourceAccount.displayName} · ${order.sourceAccount.maskedAccountNumber}`,
            ],
            ["Order reference", order.reference],
            [
              "Completed at",
              `${formatDate(order.completedAt, true)} (UTC+08:00)`,
            ],
          ]}
        />
        <p className="text-sm text-muted-foreground">
          {t(
            "This demo order added the investment amount to your portfolio at cost. It did not create a performance gain or place a real investment.",
          )}
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            className="text-primary underline"
            href={`/app/transactions/${encodeURIComponent(order.transactionId)}`}
          >
            {t("View investment transaction")}
          </Link>
          <Link className="text-primary underline" href="/app/wealth">
            {t("View portfolio")}
          </Link>
          <Link
            className="text-primary underline"
            href={`/app/accounts/${encodeURIComponent(order.sourceAccount.id)}`}
          >
            {t("View source account")}
          </Link>
        </div>
      </Panel>
    </div>
  );
}
