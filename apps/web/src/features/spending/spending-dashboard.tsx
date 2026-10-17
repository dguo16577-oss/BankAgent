"use client";
import { useLocale } from "@/lib/i18n/locale";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/features/accounts/use-accounts";
import { formatMoney } from "@/lib/money";
import type { SpendingQuery } from "@/lib/api/spending";
import { categories } from "@/lib/transaction-options";
import { useSpending } from "./use-spending";
import { Panel, RequestError } from "./presentation";
import { DailySpendingChart } from "./spending-chart";
import { RecurringList } from "./recurring-list";
const inputStyle =
  "mt-1 block w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm";
export function SpendingDashboard() {
  const { t, formatDate } = useLocale();

  const [filters, setFilters] = useState<SpendingQuery>({});
  const [mode, setMode] = useState("current");
  const [validation, setValidation] = useState("");
  const baseline = useSpending();
  const query = useSpending(filters);
  const accounts = useAccounts();
  const data = query.data;
  const drilldown = (extra: Record<string, string>) =>
    `/app/transactions?${new URLSearchParams({ ...extra, from: data!.period.from, to: data!.period.to, ...(filters.accountId ? { accountId: filters.accountId } : {}) })}`;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {t("Your money in focus")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {t("Spending")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Understand completed spending and manage future recurring payments.",
          )}
        </p>
      </header>
      <div className="space-y-4 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={mode === "current" ? "default" : "outline"}
              onClick={() => {
                setMode("current");
                setFilters({ accountId: filters.accountId });
                setValidation("");
              }}
            >
              {t("Current month")}
            </Button>
            <Button
              variant={mode === "previous" ? "default" : "outline"}
              disabled={!baseline.data}
              onClick={() => {
                if (!baseline.data) return;
                setMode("previous");
                setFilters({
                  accountId: filters.accountId,
                  from: baseline.data.comparisonPeriod.from,
                  to: baseline.data.period.from,
                });
                setValidation("");
              }}
            >
              {t("Previous month")}
            </Button>
            <Button
              variant={mode === "custom" ? "default" : "outline"}
              onClick={() => setMode("custom")}
            >
              {t("Custom range")}
            </Button>
          </div>
          <label className="min-w-0 text-xs font-medium">
            {t("Account")}
            <select
              aria-label={t("Spending account")}
              className={inputStyle}
              value={filters.accountId ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  accountId: e.target.value || undefined,
                })
              }
            >
              <option value="">{t("All CNY accounts")}</option>
              {accounts.data?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} · {t(a.currency)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {accounts.isError && (
          <RequestError
            error={accounts.error}
            retry={() => void accounts.refetch()}
          />
        )}
        {mode === "custom" && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              const from = String(values.get("from"));
              const to = String(values.get("to"));
              if (!from || !to || from > to) {
                setValidation("Choose a valid start and end date.");
                return;
              }
              const end = new Date(`${to}T00:00:00Z`);
              end.setUTCDate(end.getUTCDate() + 1);
              setFilters({
                accountId: filters.accountId,
                from: `${from}T00:00:00+08:00`,
                to: `${end.toISOString().slice(0, 10)}T00:00:00+08:00`,
              });
              setValidation("");
            }}
          >
            <label className="min-w-0 flex-1 text-xs">
              {t("From date")}
              <input
                name="from"
                aria-label={t("From date")}
                type="date"
                required
                className={inputStyle}
              />
            </label>
            <label className="min-w-0 flex-1 text-xs">
              {t("Through date")}
              <input
                name="to"
                aria-label={t("Through date")}
                type="date"
                required
                className={inputStyle}
              />
            </label>
            <Button type="submit">{t("Apply dates")}</Button>
          </form>
        )}
        {t(validation && <p role="alert">{t(validation)}</p>)}
      </div>
      {query.isPending ? (
        <p role="status">{t("Loading spending analytics…")}</p>
      ) : query.isError ? (
        <RequestError error={query.error} retry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <Panel title={t("Spending this period")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p
                    data-testid="spending-total"
                    className="text-4xl font-semibold tracking-tight tabular-nums"
                  >
                    {t(formatMoney(data.totalSpend))}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {data.transactionCount}
                    {t(" completed spending transactions ·")}
                    {t(" ")}
                    {t(data.currency)}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary px-4 py-3 text-sm">
                  <p className="font-semibold">
                    {t(
                      data.percentageChange === null
                        ? "No percentage comparison"
                        : `${data.percentageChange.startsWith("-") ? "" : "+"}${data.percentageChange}% vs comparison period`,
                    )}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t("Change ")}
                    {t(formatMoney(data.absoluteChange))}
                    {t(" · Previous")}
                    {t(" ")}
                    {t(formatMoney(data.comparisonTotalSpend))}
                  </p>
                </div>
              </div>
              <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                <p>
                  {t("Current: ")}
                  {t(formatDate(data.period.from, true))} —{t(" ")}
                  {t(formatDate(data.period.to, true))}
                </p>
                <p>
                  {t("Comparison: ")}
                  {t(formatDate(data.comparisonPeriod.from, true))} —{t(" ")}
                  {t(formatDate(data.comparisonPeriod.to, true))}
                </p>
                <p>
                  {t("UTC+08:00 · Start inclusive, end exclusive · As of")}
                  {t(" ")}
                  {t(formatDate(data.asOf, true))}
                </p>
                <p>
                  {t(
                    filters.accountId
                      ? "Selected account, original currency."
                      : "CNY accounts only; foreign-currency accounts are excluded. Select an account to view its original currency.",
                  )}
                  {t(" ")}
                  {t("No currency conversion.")}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Completed card payments, direct debits and fees. Transfers, cash withdrawals, credits and pending payments are excluded.",
                )}
              </p>
              {!data.transactionCount && (
                <p role="status">
                  {t("No completed spending in this period.")}
                </p>
              )}
            </Panel>
            <Panel title={t("Daily spending trend")}>
              <DailySpendingChart trend={data.trend} />
            </Panel>
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title={t("Category breakdown")}>
                {!data.categoryBreakdown.length ? (
                  <p>{t("No categories in this period.")}</p>
                ) : (
                  <div className="space-y-2">
                    {data.categoryBreakdown.map((item) => (
                      <Link
                        key={item.category}
                        href={drilldown({ category: item.category })}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 hover:bg-muted/50"
                      >
                        <div>
                          <p className="font-medium">
                            {t(categories[item.category])}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.transactionCount}
                            {t(" payments ·")}
                            {t(item.percentage)}%
                          </p>
                        </div>
                        <p className="font-semibold tabular-nums">
                          {t(formatMoney(item.amount))}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title={t("Top merchants")}>
                {!data.topMerchants.length ? (
                  <p>{t("No merchant spending in this period.")}</p>
                ) : (
                  <div className="space-y-2">
                    {data.topMerchants.slice(0, 6).map((item) => (
                      <Link
                        key={item.merchantId}
                        href={drilldown({ search: item.merchantName })}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 hover:bg-muted/50"
                      >
                        <div>
                          <p className="font-medium">{t(item.merchantName)}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.transactionCount}
                            {t(" payments")}
                          </p>
                        </div>
                        <p className="font-semibold tabular-nums">
                          {t(formatMoney(item.amount))}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Explore links open transaction history for the same window. History may also show pending, non-spending or other-currency activity. Use the Account filter to narrow the history.",
                  )}
                </p>
              </Panel>
            </div>
          </>
        )
      )}
      <RecurringList />
    </div>
  );
}
