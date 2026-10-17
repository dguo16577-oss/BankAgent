"use client";
import { useLocale } from "@/lib/i18n/locale";

import { statuses as transactionStatuses } from "@/lib/transaction-options";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import { formatMoney, formatTransactionAmount } from "@/lib/money";
import { useAccount } from "./use-accounts";
import { AccountsError, AccountsLoading } from "./account-states";
import {
  AccountStatus,
  accountTypeLabels,
  ExchangeNote,
} from "./account-presentation";

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const { t, formatDate } = useLocale();

  const { data, error, isPending, isError, isFetching, refetch } =
    useAccount(accountId);
  const back = (
    <Link
      href="/app/accounts"
      className="inline-flex items-center gap-2 text-sm font-medium text-primary"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {t("Back to Accounts")}
    </Link>
  );
  if (isPending)
    return (
      <div className="space-y-6">
        {back}
        <AccountsLoading detail />
      </div>
    );
  if (isError && error instanceof ApiError && error.status === 404)
    return (
      <div className="space-y-6">
        {back}
        <Card className="shadow-none">
          <CardContent className="py-8">
            <div role="status">
              <h1 className="text-2xl font-semibold">
                {t("Account not found")}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {t(
                  "This account is unavailable. Return to Accounts to choose another account.",
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  if (isError || !data)
    return (
      <div className="space-y-6">
        {back}
        <AccountsError isFetching={isFetching} retry={() => void refetch()} />
      </div>
    );
  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            {t("Account details")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {data.displayName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.maskedAccountNumber}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AccountStatus status={data.status} />
          {data.type !== "TIME_DEPOSIT" && (
            <Button asChild>
              <Link href="/app/payments/transfers/new">
                <ArrowUpRight aria-hidden="true" />
                {t("Transfer")}
              </Link>
            </Button>
          )}
        </div>
      </div>
      <section aria-label={t("Account balances")}>
        <Card className="shadow-none">
          <CardContent>
            <dl className="grid gap-6 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t("Balance · ")}
                  {t(data.currency)}
                </dt>
                <dd
                  data-testid="account-balance"
                  className="mt-2 break-all text-3xl font-semibold tabular-nums"
                >
                  {t(formatMoney(data.balance))}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t(
                    data.type === "TIME_DEPOSIT"
                      ? "Principal (locked until maturity)"
                      : "Available balance",
                  )}
                </dt>
                <dd
                  data-testid="available-balance"
                  className="mt-2 break-all text-2xl font-semibold tabular-nums"
                >
                  {t(formatMoney(data.availableBalance))}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t("Pending amount")}
                </dt>
                <dd className="mt-2 break-all text-2xl font-semibold tabular-nums">
                  {t(
                    data.pendingAmount
                      ? formatMoney(data.pendingAmount)
                      : "Not applicable",
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              {t(
                "Balance includes posted entries. Available balance excludes pending debit reservations; account status restrictions still apply.",
              )}
              <br />
              {t("As of")}
              {t(" ")}
              <time dateTime={data.asOf}>{t(formatDate(data.asOf, true))}</time>
              {t(" ")}
              {t("(UTC+08:00).")}
            </p>
          </CardContent>
        </Card>
      </section>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <section aria-label={t("Account information")}>
          <Card className="shadow-none">
            <CardHeader>
              <h2 className="font-semibold">{t("Account information")}</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="space-y-4 text-sm">
                {[
                  ["Account type", accountTypeLabels[data.type]],
                  ["Currency", data.currency],
                  ["Account number", data.maskedAccountNumber],
                  [
                    "Opened",
                    data.openedAt ? formatDate(data.openedAt) : "Not available",
                  ],
                ].map(([name, value]) => (
                  <div
                    key={name}
                    className="flex flex-wrap justify-between gap-2"
                  >
                    <dt className="text-muted-foreground">{t(name)}</dt>
                    <dd className="font-medium">{t(value)}</dd>
                  </div>
                ))}
              </dl>
              {data.baseCurrencyEquivalent && (
                <div className="space-y-3 border-t pt-5">
                  <p className="text-xs text-muted-foreground">
                    {t("Estimated ")}
                    {t(data.baseCurrencyEquivalent.value.currency)}
                    {t(" ")}
                    {t("equivalent")}
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {t(formatMoney(data.baseCurrencyEquivalent.value))}
                  </p>
                  <ExchangeNote conversion={data.baseCurrencyEquivalent} />
                </div>
              )}
              <p className="border-t pt-4 text-xs text-muted-foreground">
                {t(
                  "Only a masked account number is available in this workspace.",
                )}
              </p>
            </CardContent>
          </Card>
        </section>
        <section aria-label={t("Recent transactions")}>
          <Card className="shadow-none">
            <CardHeader>
              <h2 className="font-semibold">{t("Recent transactions")}</h2>
              <Link
                href={`/app/transactions?accountId=${encodeURIComponent(data.id)}`}
                className="text-sm font-medium text-primary"
              >
                {t("View all activity")}
              </Link>
            </CardHeader>
            <CardContent>
              {data.recentTransactions.length ? (
                <ul className="divide-y">
                  {data.recentTransactions.map((transaction) => (
                    <li
                      key={transaction.id}
                      className="flex gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                        {transaction.direction === "DEBIT" ? (
                          <Wallet size={17} aria-hidden="true" />
                        ) : (
                          <ArrowDownLeft size={17} aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-sm font-medium">
                          {transaction.title}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {t(transaction.category.toLowerCase())} ·{t(" ")}
                          <time dateTime={transaction.occurredAt}>
                            {t(formatDate(transaction.occurredAt, true))}
                          </time>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {t(formatTransactionAmount(transaction))}
                        </p>
                        {transaction.status && (
                          <p
                            className={`mt-1 text-xs ${transaction.status === "PENDING" ? "text-amber-700" : "text-muted-foreground"}`}
                          >
                            {t(transactionStatuses[transaction.status])}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-sm text-muted-foreground">
                  {t("No recent transactions for this account.")}
                </p>
              )}
              <p className="mt-5 text-xs text-muted-foreground">
                {t("Account snapshot · Times in UTC+08:00")}
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
