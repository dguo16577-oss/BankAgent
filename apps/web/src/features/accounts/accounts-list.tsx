"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { useAccounts } from "./use-accounts";
import { AccountsError, AccountsLoading } from "./account-states";
import {
  AccountStatus,
  accountTypeLabels,
  ExchangeNote,
} from "./account-presentation";

export function AccountsList() {
  const { t, formatDate } = useLocale();

  const { data, isPending, isError, isFetching, refetch } = useAccounts();
  if (isPending) return <AccountsLoading />;
  if (isError || !data)
    return (
      <AccountsError isFetching={isFetching} retry={() => void refetch()} />
    );
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          {t("Your everyday banking")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("Accounts")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Balances and available funds, clearly in view.")}
        </p>
      </div>
      <Card className="shadow-none">
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("Total balance · ")}
            {t(data.baseCurrency)}
            {t(" equivalent (estimated)")}
          </p>
          <p
            data-testid="accounts-total"
            className="break-all text-4xl font-semibold tabular-nums"
          >
            {t(formatMoney(data.totalBalance))}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              "Deposit balances only; investments excluded. This is not your available balance.",
            )}
            <br />
            {t("Snapshot as of")}
            {t(" ")}
            <time dateTime={data.asOf}>{t(formatDate(data.asOf, true))}</time>
            {t(" ")}
            {t("(UTC+08:00).")}
          </p>
          {data.exchangeEquivalents.map((conversion) => (
            <ExchangeNote
              key={`${conversion.sourceCurrency}-${conversion.value.currency}`}
              conversion={conversion}
            />
          ))}
        </CardContent>
      </Card>
      {data.accounts.length ? (
        <section
          aria-label={t("Your accounts")}
          className="grid min-w-0 gap-5 lg:grid-cols-2"
        >
          {data.accounts.map((account) => (
            <Link
              key={account.id}
              href={`/app/accounts/${encodeURIComponent(account.id)}`}
              aria-label={t(`View ${account.displayName} account`)}
              className="min-w-0 rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Card className="h-full shadow-none">
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                      <Wallet size={20} aria-hidden="true" />
                    </span>
                    <AccountStatus status={account.status} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">
                      {account.displayName}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(accountTypeLabels[account.type])} ·{t(" ")}
                      {account.maskedAccountNumber}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t("Balance · ")}
                        {t(account.currency)}
                      </p>
                      <p className="mt-1 break-all text-2xl font-semibold tabular-nums">
                        {t(formatMoney(account.balance))}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {t(
                          account.type === "TIME_DEPOSIT"
                            ? "Principal (locked until maturity)"
                            : "Available balance",
                        )}
                      </span>
                      <span className="font-medium tabular-nums">
                        {t(formatMoney(account.availableBalance))}
                      </span>
                    </div>
                    {account.baseCurrencyEquivalent && (
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">
                          {t("Estimated")}
                          {t(" ")}
                          {t(account.baseCurrencyEquivalent.value.currency)}
                          {t(" ")}
                          {t("equivalent")}
                        </span>
                        <span className="font-medium tabular-nums">
                          {t(formatMoney(account.baseCurrencyEquivalent.value))}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t pt-4 text-xs font-medium text-primary">
                    {t("View account")}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      ) : (
        <Card className="shadow-none">
          <CardContent>
            <div role="status" className="py-8 text-center">
              <Wallet
                className="mx-auto mb-4 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-semibold">{t("No accounts yet")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("Your accounts will appear here when available.")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
