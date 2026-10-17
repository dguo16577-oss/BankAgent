"use client";
import { useLocale } from "@/lib/i18n/locale";

import { isOffsetTime } from "@/lib/offset-time";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccounts } from "@/features/accounts/use-accounts";
import { formatTransactionAmount } from "@/lib/money";
import {
  categories,
  directions,
  statuses,
  types,
} from "@/lib/transaction-options";
import { useTransactions } from "./use-transactions";
import { filterKeys, readFilters } from "./filter-state";
import { TransactionStatus } from "./transaction-presentation";

const inputClass =
  "mt-1.5 h-10 w-full min-w-0 rounded-md border bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const filterLabels = {
  accountId: "Account",
  cardId: "Card",
  from: "From date",
  to: "To date",
  status: "Status",
  direction: "Direction",
  type: "Type",
  category: "Category",
  search: "Search",
};

export function TransactionsList() {
  const { t, formatDate } = useLocale();

  const searchParams = useSearchParams();
  const router = useRouter();
  const params = new URLSearchParams(searchParams.toString());
  const { filters, error: filterError } = readFilters(params);
  const query = useTransactions(filters, !filterError);
  const accounts = useAccounts();
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("cursor");
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/app/transactions${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  };
  const clear = () => router.push("/app/transactions", { scroll: false });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const groups = Map.groupBy(items, (item) => formatDate(item.occurredAt));
  const active = filterKeys.filter((key) => params.get(key));
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          {t("Your account activity")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("Transactions")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Search and explore your transaction history.")}
        </p>
      </div>
      <Card className="shadow-none">
        <CardContent className="space-y-5">
          <form
            key={searchParams.toString()}
            onSubmit={(event) => {
              event.preventDefault();
              update(
                "search",
                String(
                  new FormData(event.currentTarget).get("search") ?? "",
                ).trim(),
              );
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="min-w-0 flex-1 text-xs font-medium">
              {t("Search")}
              <input
                name="search"
                type="search"
                maxLength={100}
                defaultValue={params.get("search") ?? ""}
                placeholder={t("Title, merchant or counterparty")}
                className={inputClass}
              />
            </label>
            <Button type="submit" className="h-10">
              <Search aria-hidden="true" />
              {t("Search")}
            </Button>
          </form>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="min-w-0 text-xs font-medium">
              {t("Account")}
              <select
                aria-label={t("Account")}
                className={inputClass}
                value={params.get("accountId") ?? ""}
                onChange={(event) => update("accountId", event.target.value)}
              >
                <option value="">{t("All accounts")}</option>
                {accounts.data?.accounts.map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.displayName}
                  </option>
                ))}
                {t(
                  params.get("accountId") &&
                    !accounts.data?.accounts.some(
                      (account) => account.id === params.get("accountId"),
                    ) && (
                      <option value={params.get("accountId")!}>
                        {t("Selected account")}
                      </option>
                    ),
                )}
              </select>
            </label>
            {(
              [
                ["status", statuses],
                ["direction", directions],
                ["type", types],
                ["category", categories],
              ] as const
            ).map(([key, options]) => (
              <label key={key} className="min-w-0 text-xs font-medium">
                {t(filterLabels[key])}
                <select
                  aria-label={t(filterLabels[key])}
                  className={inputClass}
                  value={params.get(key) ?? ""}
                  onChange={(event) => update(key, event.target.value)}
                >
                  <option value="">
                    {t("All")}
                    {t(" ")}
                    {t(
                      key === "category"
                        ? "categories"
                        : key === "status"
                          ? "statuses"
                          : `${key}s`,
                    )}
                  </option>
                  {Object.entries(options).map(([value, name]) => (
                    <option key={value} value={value}>
                      {t(name)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {(["from", "to"] as const).map((key) => (
              <label key={key} className="min-w-0 text-xs font-medium">
                {t(filterLabels[key])}
                {t(" ")}
                {t(
                  isOffsetTime(params.get(key) ?? "")
                    ? key === "from"
                      ? "(inclusive, exact time)"
                      : "(exclusive, exact time)"
                    : "(inclusive)",
                )}
                <input
                  aria-label={t(filterLabels[key])}
                  type={isOffsetTime(params.get(key) ?? "") ? "text" : "date"}
                  className={inputClass}
                  value={params.get(key) ?? ""}
                  onChange={(event) => update(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Dates and transaction times use UTC+08:00. Results are ordered newest first.",
            )}
          </p>
          {accounts.isError && (
            <div role="alert" className="text-sm">
              {t("Account options could not load.")}
              {t(" ")}
              <Button variant="link" onClick={() => void accounts.refetch()}>
                {t("Retry accounts")}
              </Button>
            </div>
          )}
          {active.length > 0 && (
            <div
              aria-label={t("Active filters")}
              className="flex flex-wrap items-center gap-2"
            >
              {active.map((key) => (
                <span
                  key={key}
                  className="max-w-full break-all rounded-lg bg-secondary px-3 py-1 text-xs text-secondary-foreground"
                >
                  {t(filterLabels[key])}:{t(" ")}
                  {t(
                    key === "accountId"
                      ? (accounts.data?.accounts.find(
                          (account) => account.id === params.get(key),
                        )?.displayName ?? params.get(key))
                      : params.get(key),
                  )}
                </span>
              ))}
              <Button variant="ghost" size="sm" onClick={clear}>
                {t("Clear filters")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {filterError ? (
        <div role="alert" className="rounded-xl border bg-white p-6 text-sm">
          {t(filterError)}
          <Button variant="link" onClick={clear}>
            {t("Clear filters")}
          </Button>
        </div>
      ) : query.isPending ? (
        <div role="status" className="rounded-xl border bg-white p-8 text-sm">
          {t("Loading transactions…")}
        </div>
      ) : query.isError && !query.data ? (
        <Card className="shadow-none">
          <CardContent className="space-y-4">
            <p role="alert">
              {t("Transactions could not be loaded. Please try again.")}
            </p>
            <Button
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              {t("Retry transactions")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {!items.length ? (
            <div role="status" className="rounded-xl border bg-white p-8">
              <h2 className="font-semibold">{t("No transactions found")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("Try changing or clearing your filters.")}
              </p>
            </div>
          ) : (
            <section
              aria-label={t("Transaction results")}
              className="space-y-5"
            >
              {Array.from(groups, ([date, group]) => (
                <section key={date} aria-label={t(date)}>
                  <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground">
                    {t(date)}
                  </h2>
                  <Card className="py-0 shadow-none">
                    <CardContent className="divide-y px-4 sm:px-6">
                      {group.map((item) => (
                        <Link
                          key={item.id}
                          data-testid="transaction-row"
                          href={`/app/transactions/${encodeURIComponent(item.id)}`}
                          className="flex min-w-0 items-start gap-3 py-5"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                            {item.direction === "CREDIT" ? (
                              <ArrowDownLeft size={18} aria-hidden="true" />
                            ) : (
                              <ArrowUpRight size={18} aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="break-words text-sm font-semibold">
                              {item.title}
                            </h3>
                            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                              {t(types[item.type])} ·{" "}
                              {t(categories[item.category])}
                              <br />
                              {t(formatDate(item.occurredAt, true))}
                            </p>
                            {item.merchant && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t("Merchant: ")}
                                {item.merchant.name}
                              </p>
                            )}
                            {item.counterparty && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t("Counterparty: ")}
                                {item.counterparty.name}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 space-y-2 text-right">
                            <p
                              className={`text-sm font-semibold tabular-nums ${item.direction === "CREDIT" ? "text-emerald-700" : ""}`}
                            >
                              {t(formatTransactionAmount(item))}
                            </p>
                            <TransactionStatus status={item.status} />
                          </div>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                </section>
              ))}
            </section>
          )}
          {query.isFetchNextPageError && (
            <p role="alert" className="text-sm text-destructive">
              {t(
                "More transactions could not be loaded. Your current results are still available.",
              )}
            </p>
          )}
          {query.isError && query.data && !query.isFetchNextPageError && (
            <div role="alert">
              {t("Refresh failed.")}
              {t(" ")}
              <Button variant="link" onClick={() => void query.refetch()}>
                {t("Retry transactions")}
              </Button>
            </div>
          )}
          {query.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {t(
                  query.isFetchingNextPage
                    ? "Loading more…"
                    : query.isFetchNextPageError
                      ? "Retry load more"
                      : "Load more",
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
