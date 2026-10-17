"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  CreditCard,
  ShoppingBasket,
  Coffee,
  TrainFront,
  Repeat2,
  Wallet,
  Plus,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatMoney, formatTransactionAmount } from "@/lib/money";
import { useOverview } from "./use-overview";
import { SpendingChart } from "./spending-chart";
import { ExchangeNote } from "@/features/accounts/account-presentation";

const label = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
const transactionIcons: Partial<Record<string, typeof Wallet>> = {
  INCOME: ArrowDownLeft,
  GROCERIES: ShoppingBasket,
  DINING: Coffee,
  TRANSPORT: TrainFront,
  SUBSCRIPTIONS: Repeat2,
  HOUSING: Landmark,
  OTHER: Wallet,
};

function Panel({
  title,
  children,
  link,
}: {
  title: string;
  children: React.ReactNode;
  link?: { href: string; text: string };
}) {
  const { t } = useLocale();

  return (
    <section aria-label={t(title)} className="min-w-0">
      <Card className="h-full gap-4 shadow-none">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t(title)}</h2>
          {link && (
            <Link
              href={link.href}
              className="flex items-center gap-1 text-xs font-medium text-primary"
            >
              {t(link.text)}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          )}
        </CardHeader>
        <CardContent>{t(children)}</CardContent>
      </Card>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();

  return <p className="py-6 text-sm text-muted-foreground">{t(children)}</p>;
}

export function OverviewDashboard() {
  const { t, formatDate, formatMonth, cardType } = useLocale();

  const { data, isPending, isError, isFetching, refetch } = useOverview();
  if (isPending)
    return (
      <div
        role="status"
        aria-label={t("Loading overview")}
        className="space-y-5"
      >
        <h1 className="text-3xl font-semibold">{t("Overview")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Loading your financial overview…")}
        </p>
        <div className="h-40 rounded-xl bg-muted motion-safe:animate-pulse" />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="h-64 rounded-xl bg-muted motion-safe:animate-pulse" />
          <div className="h-64 rounded-xl bg-muted motion-safe:animate-pulse" />
        </div>
      </div>
    );
  if (isError || !data)
    return (
      <Card className="max-w-xl shadow-none">
        <CardContent className="space-y-4">
          <CircleAlert className="text-destructive" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{t("Overview")}</h1>
          <div role="alert">
            <h2 className="font-medium">
              {t("We couldn’t load your overview")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Please try again to retrieve your latest snapshot.")}
            </p>
          </div>
          <Button disabled={isFetching} onClick={() => void refetch()}>
            {t("Retry overview")}
          </Button>
        </CardContent>
      </Card>
    );
  const {
    accounts = [],
    spending,
    recentTransactions = [],
    cards = [],
    upcomingPayments = [],
    wealth,
  } = data;
  const hasSections =
    accounts.length ||
    spending ||
    recentTransactions.length ||
    cards.length ||
    upcomingPayments.length ||
    wealth;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            {t("Hello, ")}
            {data.user.displayName}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("Overview")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Your money, spending and plans — at a glance.")}
          </p>
        </div>
        <span className="rounded-full border bg-white px-3 py-1 text-xs text-muted-foreground">
          {t("Demo workspace")}
        </span>
      </div>
      <Card className="border-primary/15 shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {t("Total balance")}
              {t(" ")}
              <span className="ml-2 text-xs">
                {t(data.baseCurrency)}
                {t(" equivalent (estimated)")}
              </span>
            </p>
            <p
              data-testid="total-balance"
              className="mt-2 break-all text-4xl font-semibold tracking-tight tabular-nums"
            >
              {t(formatMoney(data.totalBalance))}
            </p>
            <p className="mt-3 max-w-xl text-xs leading-5 text-muted-foreground">
              {t(data.balanceNote)}
            </p>
            {data.exchangeEquivalents?.map((conversion) => (
              <ExchangeNote
                key={`${conversion.sourceCurrency}-${conversion.value.currency}`}
                conversion={conversion}
              />
            ))}
            <p className="mt-1 text-xs text-muted-foreground">
              {t("As of")}
              {t(" ")}
              <time dateTime={data.asOf}>{t(formatDate(data.asOf, true))}</time>
              {t(" ")}
              {t("(UTC+08:00)")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled>
              <Plus aria-hidden="true" />
              {t("Add money · Soon")}
            </Button>
            <Button asChild>
              <Link href="/app/payments/transfers/new">
                <ArrowUpRight aria-hidden="true" />
                {t("Transfer")}
              </Link>
            </Button>
            <Button variant="outline" disabled>
              <ArrowLeftRight aria-hidden="true" />
              {t("Exchange · Soon")}
            </Button>
          </div>
        </CardContent>
      </Card>
      {!hasSections && (
        <div
          role="status"
          className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground"
        >
          {t("Your overview is ready. No financial activity is available yet.")}
        </div>
      )}
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Panel
          title={t("Accounts")}
          link={{ href: "/app/accounts", text: "View all accounts" }}
        >
          {accounts.length ? (
            <ul className="divide-y">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                    <Wallet size={19} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">
                      {account.displayName}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(label(account.type))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold tabular-nums">
                      {t(formatMoney(account.balance))}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(account.balance.currency)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t("No accounts to display.")}</Empty>
          )}
        </Panel>
        <Panel
          title={t("Spending")}
          link={{ href: "/app/spending", text: "View spending" }}
        >
          {spending ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("This month ·")}
                    {t(" ")}
                    {t(formatMonth(spending.currentPeriod.periodStart))}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {t(formatMoney(spending.currentPeriod.amount))}
                  </p>
                </div>
                <p className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                  {t(
                    spending.changePercent === null
                      ? "No comparison available"
                      : `${spending.changePercent.startsWith("-") ? "↓" : "↑"} ${spending.changePercent.replace("-", "")}% vs previous-month same-day range`,
                  )}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("Current MTD:")}
                {t(" ")}
                {t(formatDate(spending.currentPeriod.periodStart, true))} —
                {t(" ")}
                {t(formatDate(spending.currentPeriod.periodEnd, true))}.
                <br />
                {t("Comparison:")}
                {t(" ")}
                {t(formatDate(spending.comparisonPeriod.periodStart, true))} —
                {t(" ")}
                {t(formatDate(spending.comparisonPeriod.periodEnd, true))} (
                {t(formatMoney(spending.comparisonPeriod.amount))}).
                <br />
                {t(
                  "UTC+08:00 · Start inclusive, end exclusive. Completed spending only.",
                )}
              </p>
              <SpendingChart trend={spending.trend} />
            </>
          ) : (
            <Empty>{t("No spending summary available.")}</Empty>
          )}
        </Panel>
      </div>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Panel
          title={t("Recent transactions")}
          link={{ href: "/app/transactions", text: "View all transactions" }}
        >
          {recentTransactions.length ? (
            <ul className="divide-y">
              {recentTransactions.map((transaction) => {
                const Icon = transactionIcons[transaction.category] ?? Wallet;
                const credit = transaction.direction === "CREDIT";
                return (
                  <li
                    key={transaction.id}
                    className="flex gap-3 py-4 first:pt-0 last:pb-0"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium">
                        {transaction.title}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t(label(transaction.category))} ·{t(" ")}
                        <time dateTime={transaction.occurredAt}>
                          {t(formatDate(transaction.occurredAt, true))}
                        </time>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-sm font-semibold tabular-nums ${credit ? "text-emerald-700" : ""}`}
                      >
                        {t(formatTransactionAmount(transaction))}
                      </p>
                      {transaction.status && (
                        <p
                          className={`mt-1 text-xs ${transaction.status === "PENDING" ? "text-amber-700" : "text-muted-foreground"}`}
                        >
                          {t(label(transaction.status))}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>{t("No recent transactions.")}</Empty>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            {t("Transaction times shown in UTC+08:00.")}
          </p>
        </Panel>
        <Panel
          title={t("Your cards")}
          link={{ href: "/app/cards", text: "View cards" }}
        >
          {cards.length ? (
            <div className="space-y-4">
              {cards.map((card, index) => (
                <div
                  key={card.id}
                  className={`rounded-xl border p-5 ${index === 0 ? "border-primary bg-primary text-primary-foreground" : "bg-secondary/50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {t(card.scheme === "VISA" ? "Visa" : "Mastercard")}
                      {t(" ")}
                      {cardType(card.type, label(card.type))}
                    </span>
                    <CreditCard size={22} aria-hidden="true" />
                  </div>
                  <p className="mt-5 text-xl tracking-[.15em]">
                    {card.maskedNumber}
                  </p>
                  <p className="mt-3 text-xs">{t(label(card.status))}</p>
                </div>
              ))}
            </div>
          ) : (
            <Empty>{t("No cards to display.")}</Empty>
          )}
        </Panel>
      </div>
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Panel title={t("Upcoming payments")}>
          {upcomingPayments.length ? (
            <ul className="divide-y">
              {upcomingPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <CalendarDays
                    size={19}
                    className="shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">{payment.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <time dateTime={payment.dueAt}>
                        {t(formatDate(payment.dueAt))}
                      </time>
                      {t(" ")}· {t(label(payment.type))}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">
                    {t(formatMoney(payment.amount))}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t("No upcoming payments.")}</Empty>
          )}
        </Panel>
        <Panel
          title={t("Wealth")}
          link={{ href: "/app/wealth", text: "View portfolio" }}
        >
          {wealth ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("Portfolio total")}
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <p className="text-2xl font-semibold tabular-nums">
                  {t(formatMoney(wealth.total))}
                </p>
                <p
                  className={`text-xs ${wealth.monthlyChange.amount.startsWith("-") ? "text-amber-700" : "text-emerald-700"}`}
                >
                  {t(formatMoney(wealth.monthlyChange, true))}
                  {t(
                    wealth.monthlyChangePercent !== null &&
                      ` (${wealth.monthlyChangePercent}%)`,
                  )}
                  {t(" ")}
                  {t("this month")}
                </p>
              </div>
              <p className="mt-4 mb-2 text-xs text-muted-foreground">
                {wealth.holdings.length}
                {t(" holdings")}
              </p>
              {wealth.holdings.length ? (
                <ul className="divide-y">
                  {wealth.holdings.map((holding) => (
                    <li
                      key={holding.id}
                      className="flex justify-between gap-3 py-2 text-sm"
                    >
                      <span>{holding.name}</span>
                      <span className="font-medium tabular-nums">
                        {t(formatMoney(holding.value))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{t("No holdings available.")}</Empty>
              )}
            </>
          ) : (
            <Empty>{t("No wealth summary available.")}</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
