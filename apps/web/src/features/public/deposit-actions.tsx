"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccounts } from "@/features/accounts/use-accounts";
import {
  listTimeDeposits,
  openCurrencyAccount,
  openTimeDeposit,
  type Currency,
} from "@/lib/api/deposits";
import { sessionOptions } from "@/lib/api/session";
import { formatMoney, formatDate } from "@/lib/money";
import { useLocale } from "@/lib/i18n/locale";
import { useRates } from "./use-public";

const currencies: Currency[] = [
  "USD",
  "JPY",
  "EUR",
  "GBP",
  "HKD",
  "AUD",
  "SGD",
];

export function CurrencyAccountOpening() {
  const { t, errorMessage } = useLocale();
  const queryClient = useQueryClient();
  const session = useQuery(sessionOptions);
  const accounts = useAccounts();
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState("");
  const authenticated = !!session.data?.authenticated;
  const existing =
    accounts.data?.accounts.filter((a) => a.type === "MULTI_CURRENCY") ?? [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setOpened("");
    try {
      const account = await openCurrencyAccount(currency);
      setOpened(account.id);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    } catch (failure) {
      setError(
        errorMessage(
          failure instanceof Error
            ? failure
            : new Error("The API request failed."),
        ) ?? "The API request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="open-currency-account">
      <CardContent className="space-y-4">
        <h2 className="text-xl font-semibold">
          {t("Open a currency account")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Open a separate zero-balance demo account for each currency. Exchange and funding are not available yet.",
          )}
        </p>
        {!authenticated ? (
          <Button asChild>
            <Link
              href={`/login?next=${encodeURIComponent("/products/global-currency-account#open-currency-account")}`}
            >
              {t("Sign in to continue")}
            </Link>
          </Button>
        ) : (
          <form
            onSubmit={(event) => void submit(event)}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="min-w-44 text-sm font-medium">
              {t("Currency")}
              <select
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value as Currency)
                }
              >
                {currencies.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={
                busy ||
                accounts.isPending ||
                existing.some((a) => a.currency === currency)
              }
              type="submit"
            >
              {busy ? t("Opening…") : t("Open account")}
            </Button>
          </form>
        )}
        {existing.length > 0 && (
          <p className="text-sm">
            {t("Already open:")} {existing.map((a) => a.currency).join(", ")}
          </p>
        )}
        {accounts.isError && <p role="alert">{errorMessage(accounts.error)}</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {opened && (
          <p role="status">
            <Link
              className="underline"
              href={`/app/accounts/${encodeURIComponent(opened)}`}
            >
              {t("Account opened. View account →")}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function TimeDepositOpening() {
  const { t, errorMessage } = useLocale();
  const queryClient = useQueryClient();
  const session = useQuery(sessionOptions);
  const accounts = useAccounts();
  const rates = useRates();
  const holdings = useQuery({
    queryKey: ["time-deposits"],
    queryFn: ({ signal }) => listTimeDeposits(signal),
    enabled: !!session.data?.authenticated,
    retry: false,
  });
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openedId, setOpenedId] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const eligible =
    accounts.data?.accounts.filter(
      (a) =>
        a.currency === "CNY" &&
        a.status === "ACTIVE" &&
        ["CURRENT", "SAVINGS"].includes(a.type),
    ) ?? [];
  const selected = eligible.find((a) => a.id === source) ?? eligible[0];
  const rate = rates.data?.items.find((r) => r.id === "deposit");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !selected ||
      !/^(0|[1-9]\d*)\.\d{2}$/.test(amount) ||
      amount === "0.00" ||
      !confirm
    ) {
      setError(
        t("Enter an amount with two decimal places and confirm the deposit."),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const receipt = await openTimeDeposit(selected.id, amount, password, key);
      setOpenedId(receipt.depositAccountId);
      setPassword("");
      setKey(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["time-deposits"] }),
      ]);
    } catch (failure) {
      setError(
        errorMessage(
          failure instanceof Error
            ? failure
            : new Error("The API request failed."),
        ) ?? "The API request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="open-time-deposit">
      <CardContent className="space-y-5">
        <h2 className="text-xl font-semibold">
          {t("Open a 12-month time deposit")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Demo funds will be deducted immediately from your selected CNY account and placed in a new time-deposit account. No automatic maturity payout or early withdrawal is available yet.",
          )}
        </p>
        {rate && (
          <p className="text-sm">
            {t("Illustrative fixed annual rate at opening:")} {rate.value}% ·{" "}
            {t("Source:")} {rates.data?.source} · {rates.data?.asOf}
          </p>
        )}
        {!session.data?.authenticated ? (
          <Button asChild>
            <Link
              href={`/login?next=${encodeURIComponent("/products/time-deposit#open-time-deposit")}`}
            >
              {t("Sign in to continue")}
            </Link>
          </Button>
        ) : accounts.isPending ? (
          <p role="status">{t("Loading your accounts…")}</p>
        ) : accounts.isError ? (
          <div role="alert">
            {errorMessage(accounts.error)}{" "}
            <Button variant="outline" onClick={() => void accounts.refetch()}>
              {t("Retry")}
            </Button>
          </div>
        ) : eligible.length === 0 ? (
          <p>{t("No eligible CNY source account is available.")}</p>
        ) : (
          <form
            className="grid max-w-lg gap-4"
            onSubmit={(event) => void submit(event)}
          >
            <label className="text-sm font-medium">
              {t("Source account")}
              <select
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
                value={selected?.id}
                onChange={(event) => {
                  setSource(event.target.value);
                  setKey(crypto.randomUUID());
                }}
              >
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName} · {a.maskedAccountNumber} ·{" "}
                    {formatMoney(a.availableBalance)} {t("available")}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              {t("Deposit amount (CNY)")}
              <input
                required
                inputMode="decimal"
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
                placeholder="1000.00"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setKey(crypto.randomUUID());
                }}
              />
            </label>
            <label className="text-sm font-medium">
              {t("Confirm with your account password")}
              <input
                required
                type="password"
                autoComplete="current-password"
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                required
                type="checkbox"
                checked={confirm}
                onChange={(event) => setConfirm(event.target.checked)}
              />
              {t(
                "I understand this demo transfer immediately debits my source account and has no early-withdrawal flow.",
              )}
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? t("Opening…") : t("Deposit now")}
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {openedId && (
          <p role="status">
            <Link
              href={`/app/accounts/${encodeURIComponent(openedId)}`}
              className="font-medium underline"
            >
              {t("Deposit opened. View account →")}
            </Link>
          </p>
        )}
        {holdings.data?.items.length ? (
          <div>
            <h3 className="font-semibold">{t("Your time deposits")}</h3>
            <ul className="mt-3 space-y-2">
              {holdings.data.items.map((h) => (
                <li key={h.id} className="rounded-lg border p-3 text-sm">
                  <Link
                    className="font-medium underline"
                    href={`/app/accounts/${encodeURIComponent(h.depositAccountId)}`}
                  >
                    {formatMoney(h.amount)}
                  </Link>{" "}
                  · {t("Matures")} {formatDate(h.maturesAt)} · {h.annualRate}%
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {holdings.isError && (
          <div role="alert">
            {errorMessage(holdings.error)}{" "}
            <Button variant="outline" onClick={() => void holdings.refetch()}>
              {t("Retry")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
