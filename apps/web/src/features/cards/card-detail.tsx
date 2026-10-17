"use client";
import { useLocale } from "@/lib/i18n/locale";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  CardDetail,
  CardControls,
  CardLimits,
  CreateCardActionRequest,
} from "@/lib/api/cards";
import { useTransactions } from "@/features/transactions/use-transactions";
import { formatTransactionAmount } from "@/lib/money";
import { TransactionStatus } from "@/features/transactions/transaction-presentation";
import { useCard, usePrepareCardAction } from "./use-cards";
import { CreditLimitRequest } from "./credit-limit-request";
import {
  CardVisual,
  CardStatus,
  CardError,
  controlLabels,
} from "./card-presentation";
function ControlsAndActions({ card }: { card: CardDetail }) {
  const { t, errorMessage } = useLocale();

  const [draft, setDraft] = useState<CardControls>(card.controls);
  const [limitDraft, setLimitDraft] = useState({
    perTransaction: card.limits?.perTransaction ?? "",
    daily: card.limits?.daily ?? "",
  });
  const prepare = usePrepareCardAction();
  const router = useRouter();
  const eligible = card.status === "ACTIVE" || card.status === "FROZEN";
  const changed = (Object.keys(controlLabels) as (keyof CardControls)[]).some(
    (key) => draft[key] !== card.controls[key],
  );
  const limitsChanged =
    !!card.limits &&
    (limitDraft.perTransaction !== card.limits.perTransaction ||
      limitDraft.daily !== card.limits.daily);
  async function review(request: CreateCardActionRequest) {
    try {
      const intent = await prepare.mutateAsync(request);
      router.push(
        `/app/cards/${encodeURIComponent(card.id)}/actions/review/${encodeURIComponent(intent.id)}`,
      );
    } catch {
      /* Surface API validation below. */
    }
  }
  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardStatus status={card.status} />
            {eligible && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={prepare.isPending}
                  onClick={() =>
                    void review({
                      cardId: card.id,
                      actionType:
                        card.status === "ACTIVE" ? "FREEZE" : "UNFREEZE",
                    })
                  }
                >
                  {t(
                    card.status === "ACTIVE" ? "Freeze card" : "Unfreeze card",
                  )}
                </Button>
                <Button
                  variant="destructive"
                  disabled={prepare.isPending}
                  onClick={() =>
                    void review({ cardId: card.id, actionType: "REPORT_LOST" })
                  }
                >
                  {t("Report card lost")}
                </Button>
              </div>
            )}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {t(
              "Freezing preserves your existing transactions and pending amounts. Every change requires a review.",
            )}
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader>
          <h2 className="font-semibold">{t("Card controls")}</h2>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void review({
                cardId: card.id,
                actionType: "UPDATE_CONTROLS",
                controls: draft,
              });
            }}
          >
            {(
              Object.entries(controlLabels) as [keyof CardControls, string][]
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-4 border-b pb-4 text-sm"
              >
                <span>
                  <span className="block font-medium">{t(label)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("Saved: ")}
                    {t(card.controls[key] ? "ON" : "OFF")}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={t(label)}
                  checked={draft[key]}
                  disabled={!eligible || prepare.isPending}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.checked })
                  }
                  className="size-5 shrink-0 accent-primary"
                />
              </label>
            ))}
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Selections are not saved until you review and confirm. Actions that restore payment capabilities require additional verification.",
              )}
            </p>
            <Button
              type="submit"
              disabled={!eligible || !changed || prepare.isPending}
            >
              {t("Review control changes")}
            </Button>
          </form>
        </CardContent>
      </Card>
      {card.limits && (
        <Card className="shadow-none">
          <CardHeader>
            <h2 className="font-semibold">{t("Transaction limits")}</h2>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void review({
                  cardId: card.id,
                  actionType: "UPDATE_LIMITS",
                  limits: limitDraft,
                });
              }}
            >
              {(
                [
                  [
                    "perTransaction",
                    "Per transaction",
                    "bankMaxPerTransaction",
                  ],
                  ["daily", "Daily", "bankMaxDaily"],
                ] as [keyof typeof limitDraft, string, keyof CardLimits][]
              ).map(([key, label, maxKey]) => (
                <label key={key} className="block space-y-1 text-sm">
                  <span className="font-medium">{t(label)} (CNY)</span>
                  <input
                    type="number"
                    min="0.01"
                    max={card.limits![maxKey]}
                    step="0.01"
                    required
                    disabled={!eligible || prepare.isPending}
                    value={limitDraft[key]}
                    onChange={(event) =>
                      setLimitDraft({
                        ...limitDraft,
                        [key]: event.target.value,
                      })
                    }
                    className="block w-full rounded-md border bg-background px-3 py-2"
                  />
                  <span className="block text-xs text-muted-foreground">
                    {t("Bank maximum")}: {card.limits![maxKey]} CNY
                  </span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                {t(
                  "These transaction limits do not change the bank-granted credit limit.",
                )}
              </p>
              <Button
                disabled={!eligible || !limitsChanged || prepare.isPending}
              >
                {t("Review limit changes")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {prepare.isPending && (
        <p role="status">{t("Preparing card action review…")}</p>
      )}
      {prepare.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(prepare.error)}
        </p>
      )}
    </div>
  );
}
export function CardDetailPage({ cardId }: { cardId: string }) {
  const { t, formatDate, cardType } = useLocale();

  const query = useCard(cardId);
  const transactions = useTransactions({ cardId }, !!query.data);
  if (query.isPending) return <p role="status">{t("Loading card…")}</p>;
  if (query.isError)
    return <CardError error={query.error} retry={() => void query.refetch()} />;
  const card = query.data;
  return (
    <div className="space-y-6">
      <Link href="/app/cards" className="inline-flex text-sm text-primary">
        {t("← Back to Cards")}
      </Link>
      <div>
        <h1 className="text-3xl font-semibold">{card.displayName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(card.scheme)} · {cardType(card.type)}
        </p>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <CardVisual card={card} />
          <Card className="shadow-none">
            <CardHeader>
              <h2 className="font-semibold">{t("Linked account")}</h2>
            </CardHeader>
            <CardContent>
              <Link
                href={`/app/accounts/${encodeURIComponent(card.linkedAccount.id)}`}
                className="font-medium text-primary underline"
              >
                {card.linkedAccount.displayName}
              </Link>
              <p className="mt-2 text-sm text-muted-foreground">
                {card.linkedAccount.maskedAccountNumber}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader>
              <h2 className="font-semibold">{t("Recent card activity")}</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              {transactions.isPending ? (
                <p role="status">{t("Loading card activity…")}</p>
              ) : transactions.isError ? (
                <CardError
                  error={transactions.error}
                  retry={() => void transactions.refetch()}
                />
              ) : transactions.data?.pages[0].items.length ? (
                <ul className="divide-y">
                  {transactions.data.pages[0].items.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <Link
                        data-testid="card-transaction"
                        href={`/app/transactions/${encodeURIComponent(item.id)}`}
                        className="flex flex-wrap items-center justify-between gap-3 py-4"
                      >
                        <span>
                          <span className="block text-sm font-medium">
                            {item.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t(formatDate(item.occurredAt, true))}
                          </span>
                        </span>
                        <span className="space-y-2 text-right">
                          <span className="block text-sm font-semibold">
                            {t(formatTransactionAmount(item))}
                          </span>
                          <TransactionStatus status={item.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("No card transactions found.")}</p>
              )}
              <Link
                href={`/app/transactions?cardId=${encodeURIComponent(card.id)}`}
                className="inline-flex text-sm text-primary underline"
              >
                {t("View all card activity")}
              </Link>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <ControlsAndActions key={`${card.id}-${card.version}`} card={card} />
          {card.type === "CREDIT" && <CreditLimitRequest cardId={card.id} />}
        </div>
      </div>
    </div>
  );
}
