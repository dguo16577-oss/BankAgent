"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import { formatTransactionAmount } from "@/lib/money";
import { categories, directions, types } from "@/lib/transaction-options";
import { useTransaction } from "./use-transactions";
import { TransactionStatus } from "./transaction-presentation";

export function TransactionDetailPage({
  transactionId,
}: {
  transactionId: string;
}) {
  const { t, formatDate } = useLocale();

  const { data, error, isPending, isError, isFetching, refetch } =
    useTransaction(transactionId);
  const back = (
    <Link
      href="/app/transactions"
      className="inline-flex items-center gap-2 text-sm font-medium text-primary"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {t("Back to Transactions")}
    </Link>
  );
  if (isPending)
    return (
      <div className="space-y-6">
        {back}
        <p role="status">{t("Loading transaction…")}</p>
      </div>
    );
  if (isError && error instanceof ApiError && error.status === 404)
    return (
      <div className="space-y-6">
        {back}
        <Card className="shadow-none">
          <CardContent>
            <h1 className="text-2xl font-semibold">
              {t("Transaction not found")}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "This transaction is unavailable. Return to Transactions to choose another record.",
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  if (isError || !data)
    return (
      <div className="space-y-6">
        {back}
        <Card className="shadow-none">
          <CardContent className="space-y-4">
            <p role="alert">{t("Transaction could not be loaded.")}</p>
            <Button disabled={isFetching} onClick={() => void refetch()}>
              {t("Retry transaction")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  const fields = [
    ["Direction", directions[data.direction]],
    ["Type", types[data.type]],
    ["Category", categories[data.category]],
    ["Occurred", formatDate(data.occurredAt, true)],
    ["Booked", data.bookedAt ? formatDate(data.bookedAt, true) : "Not posted"],
    ["Reference", data.reference ?? "Not available"],
  ];
  return (
    <div className="space-y-6">
      {back}
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          {t("Transaction details")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{data.title}</h1>
      </div>
      <Card className="shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {t(data.amount.currency)} · {t(directions[data.direction])}
            </p>
            <p
              data-testid="transaction-amount"
              className="mt-2 break-all text-4xl font-semibold tabular-nums"
            >
              {t(formatTransactionAmount(data))}
            </p>
          </div>
          <TransactionStatus status={data.status} />
        </CardContent>
      </Card>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <h2 className="font-semibold">{t("Transaction information")}</h2>
          </CardHeader>
          <CardContent>
            <dl className="space-y-5 text-sm">
              {fields.map(([name, value]) => (
                <div
                  key={name}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <dt className="text-muted-foreground">{t(name)}</dt>
                  <dd className="min-w-0 break-all font-medium">
                    {name === "Reference" ? value : t(value)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs text-muted-foreground">
              {t("All times in UTC+08:00.")}
            </p>
            {data.status === "PENDING" && (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t(
                  "This transaction has not posted. Pending debits reserve funds and reduce the available balance.",
                )}
              </p>
            )}
            {data.status === "REVERSED" && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t(
                  "This transaction was reversed and has no net effect on the snapshot balance.",
                )}
              </p>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader>
              <h2 className="font-semibold">{t("Account")}</h2>
            </CardHeader>
            <CardContent>
              <Link
                href={`/app/accounts/${encodeURIComponent(data.accountId)}`}
                className="font-medium text-primary underline underline-offset-4"
              >
                {data.account.displayName}
              </Link>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.account.maskedAccountNumber} · {t(data.account.currency)}
              </p>
            </CardContent>
          </Card>
          {data.merchant && (
            <Card className="shadow-none">
              <CardHeader>
                <h2 className="font-semibold">{t("Merchant")}</h2>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="font-medium">{data.merchant.name}</p>
                {t(
                  data.merchant.location && (
                    <p className="text-muted-foreground">
                      {t(data.merchant.location)}
                    </p>
                  ),
                )}
                {t(
                  data.merchant.maskedCardNumber && (
                    <p>
                      {t("Card ")}
                      {t(data.merchant.maskedCardNumber)}
                    </p>
                  ),
                )}
              </CardContent>
            </Card>
          )}
          {data.counterparty && (
            <Card className="shadow-none">
              <CardHeader>
                <h2 className="font-semibold">{t("Counterparty")}</h2>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="font-medium">{data.counterparty.name}</p>
                <p className="text-muted-foreground">
                  {data.counterparty.maskedAccountNumber}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
