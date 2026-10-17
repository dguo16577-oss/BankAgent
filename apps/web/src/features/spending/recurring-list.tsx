"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { useRecurringPayments } from "./use-spending";
import {
  Panel,
  RequestError,
  Status,
  words,
  recurringHref,
} from "./presentation";
export function RecurringList() {
  const { t, formatDate } = useLocale();

  const query = useRecurringPayments();
  return (
    <Panel title={t("Recurring payments")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "Bank-managed payments and patterns found in your transaction history.",
        )}
      </p>
      {query.isPending ? (
        <p role="status">{t("Loading recurring payments…")}</p>
      ) : query.isError ? (
        <RequestError error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <p>{t("No recurring payments to display.")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {query.data.items.map((item) => (
            <Link
              key={item.id}
              href={recurringHref(item.id)}
              className="min-w-0 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{item.displayName}</h3>
                <Status value={item.status} />
              </div>
              <p className="mt-3 text-lg font-semibold tabular-nums">
                {t(formatMoney(item.usualAmount))}
                {t(" ")}
                <span className="text-xs font-normal text-muted-foreground">
                  / {t(words(item.frequency))}
                </span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("Next:")}
                {t(" ")}
                {t(
                  item.nextExpectedAt
                    ? formatDate(item.nextExpectedAt)
                    : item.status === "STOPPED"
                      ? "No future payments"
                      : "No confirmed date",
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(words(item.source))}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
