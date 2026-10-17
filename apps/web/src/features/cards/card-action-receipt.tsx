"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";

import { useCardAction } from "./use-cards";
import {
  CardError,
  ExactChanges,
  actionLabels,
  CardStatus,
} from "./card-presentation";
export function CardActionReceiptPage({
  cardId,
  actionId,
}: {
  cardId: string;
  actionId: string;
}) {
  const { t, formatDate } = useLocale();

  const query = useCardAction(actionId);
  if (query.isPending)
    return <p role="status">{t("Loading card action receipt…")}</p>;
  if (query.isError)
    return <CardError error={query.error} retry={() => void query.refetch()} />;
  const receipt = query.data;
  if (receipt.card.id !== cardId)
    return (
      <CardError
        error={
          new ApiError(
            "Card action not found.",
            404,
            "http",
            "CARD_ACTION_NOT_FOUND",
          )
        }
        retry={() => void query.refetch()}
      />
    );
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/app/cards" className="inline-flex text-sm text-primary">
        {t("← Back to Cards")}
      </Link>
      <Card className="shadow-none">
        <CardContent className="space-y-6">
          <CheckCircle2
            className="size-10 text-emerald-700"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-semibold">
            {t("Card action completed")}
          </h1>
          <div className="space-y-3">
            <p className="font-medium">{t(actionLabels[receipt.actionType])}</p>
            <p className="text-sm">
              {receipt.card.displayName} · {receipt.card.maskedNumber}
            </p>
            <CardStatus status={receipt.after.status} />
          </div>
          <ExactChanges before={receipt.before} after={receipt.after} />
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              {t("Reference:")}
              {receipt.reference}
            </p>
            <p>
              {t("Completed: ")}
              {t(formatDate(receipt.completedAt, true))}
              {t(" (UTC+08:00)")}
            </p>
            <p>
              {t(
                "This receipt records the change at completion. Open the card for its current state.",
              )}
            </p>
          </div>
          <Button asChild>
            <Link href={`/app/cards/${encodeURIComponent(cardId)}`}>
              {t("View card")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
