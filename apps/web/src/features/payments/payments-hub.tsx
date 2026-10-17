"use client";
import { useLocale } from "@/lib/i18n/locale";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useTransactions } from "@/features/transactions/use-transactions";
import { formatTransactionAmount } from "@/lib/money";
import { useRecipients } from "./use-payments";
import { fieldClass, PaymentError } from "./payment-ui";
export function PaymentsHub() {
  const { t, formatDate } = useLocale();

  const [search, setSearch] = useState("");
  const recipients = useRecipients(search);
  const transfers = useTransactions({ type: "BANK_TRANSFER" });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t("Payments")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Send a domestic CNY bank transfer to a saved recipient.")}
          </p>
        </div>
        <Button asChild>
          <Link href="/app/payments/transfers/new">
            {t("New bank transfer")}
          </Link>
        </Button>
      </div>
      <nav className="flex flex-wrap gap-4">
        <Link className="text-primary" href="/app/payments/scheduled">
          {t("Scheduled payments")}
        </Link>
        <Link className="text-primary" href="/app/payments/scheduled/new">
          {t("Schedule payment")}
        </Link>
      </nav>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="min-w-0 shadow-none">
          <CardHeader>
            <h2 className="font-semibold">{t("Saved recipients")}</h2>
            <Link
              href="/app/payments/recipients/new"
              className="text-sm text-primary"
            >
              {t("Add recipient")}
            </Link>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(
                  String(new FormData(event.currentTarget).get("search") ?? ""),
                );
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <label className="min-w-0 flex-1 text-sm">
                {t("Search recipients")}
                <input
                  name="search"
                  type="search"
                  maxLength={100}
                  className={fieldClass}
                />
              </label>
              <Button type="submit" variant="outline">
                {t("Search")}
              </Button>
            </form>
            {recipients.isPending ? (
              <p role="status">{t("Loading recipients…")}</p>
            ) : recipients.isError ? (
              <PaymentError
                error={recipients.error}
                retry={() => void recipients.refetch()}
              />
            ) : recipients.data.items.length ? (
              <ul className="divide-y">
                {recipients.data.items.map((item) => (
                  <li key={item.id} className="py-4">
                    <Link
                      className="font-medium text-primary"
                      href={`/app/payments/recipients/${encodeURIComponent(item.id)}`}
                    >
                      {item.displayName}
                    </Link>
                    {item.status === "INACTIVE" && <p>{t("INACTIVE")}</p>}
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(item.bankName)} · {item.maskedAccountNumber} ·{t(" ")}
                      {t(item.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("No recipients found.")}</p>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0 shadow-none">
          <CardHeader>
            <h2 className="font-semibold">{t("Recent transfers")}</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            {transfers.isPending ? (
              <p role="status">{t("Loading transfers…")}</p>
            ) : transfers.isError ? (
              <PaymentError
                error={transfers.error}
                retry={() => void transfers.refetch()}
              />
            ) : transfers.data?.pages[0].items.length ? (
              <ul className="divide-y">
                {transfers.data.pages[0].items.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/app/transactions/${encodeURIComponent(item.id)}`}
                      className="flex flex-wrap justify-between gap-3 py-4"
                    >
                      <span>
                        <span className="block font-medium">{item.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {t(formatDate(item.occurredAt, true))}
                        </span>
                      </span>
                      <span className="font-medium">
                        {t(formatTransactionAmount(item))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("No transfers yet.")}</p>
            )}
            <Link
              href="/app/transactions?type=BANK_TRANSFER"
              className="text-sm text-primary underline"
            >
              {t("View all transfers")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
