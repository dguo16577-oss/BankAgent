"use client";
import { rememberReceipt } from "@/lib/api/receipt-navigation";
import { ActionVerification } from "@/features/security/action-verification";
import { useLocale } from "@/lib/i18n/locale";

import { isConflict } from "@/lib/api/conflict";
import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

import { ApiError } from "@/lib/api/client";
import { useCardIntent, useExecuteCardAction } from "./use-cards";
import { CardError, ExactChanges, actionLabels } from "./card-presentation";
export function CardActionReview({
  cardId,
  intentId,
}: {
  cardId: string;
  intentId: string;
  challengeId?: string;
}) {
  const { t, formatDate, errorMessage } = useLocale();

  const query = useCardIntent(intentId);
  const execute = useExecuteCardAction();
  const router = useRouter();
  const locked = useRef(false);
  if (query.isPending)
    return <p role="status">{t("Loading card action review…")}</p>;
  if (query.isError)
    return <CardError error={query.error} retry={() => void query.refetch()} />;
  const intent = query.data;
  if (intent.card.id !== cardId)
    return (
      <CardError
        error={
          new ApiError(
            "Card action not found.",
            404,
            "http",
            "CARD_ACTION_INTENT_NOT_FOUND",
          )
        }
        retry={() => void query.refetch()}
      />
    );
  const action =
    intent.actionType === "FREEZE"
      ? "CARD_FREEZE"
      : intent.actionType === "UNFREEZE"
        ? "CARD_UNFREEZE"
        : intent.riskDirection === "RISK_INCREASING"
          ? "CARD_CONTROL_RISK_INCREASING"
          : "CARD_CONTROL_PROTECTIVE";
  const confirm = async (actionAuthorizationId?: string) => {
    if (locked.current || execute.isSuccess) return;
    locked.current = true;
    try {
      const receipt = await execute.mutateAsync({
        request: {
          intentId: intent.id,
          intentHash: intent.intentHash,
          ...(actionAuthorizationId ? { actionAuthorizationId } : {}),
        },
        key: `confirm_${intent.id}`,
      });
      rememberReceipt(
        intent.id,
        `/app/cards/${encodeURIComponent(cardId)}/actions/${encodeURIComponent(receipt.id)}`,
      );
      router.replace(
        `/app/cards/${encodeURIComponent(cardId)}/actions/${encodeURIComponent(receipt.id)}`,
      );
    } catch {
      // Keep the same intent, authorization and key on uncertain-outcome retry.
    } finally {
      locked.current = false;
    }
  };
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/app/cards/${encodeURIComponent(cardId)}`}
        className="inline-flex text-sm text-primary"
      >
        {t("← Back to card")}
      </Link>
      <div>
        <h1 className="text-3xl font-semibold">{t("Review card action")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {intent.card.displayName} · {intent.card.maskedNumber}
        </p>
      </div>
      <Card className="shadow-none">
        <CardContent className="space-y-6">
          <h2 className="text-xl font-semibold">
            {t(actionLabels[intent.actionType])}
          </h2>
          <ExactChanges before={intent.before} after={intent.after} />
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              {t("Risk direction:")}
              {t(" ")}
              <span data-testid="risk-direction" className="font-semibold">
                {t(intent.riskDirection)}
              </span>
            </p>
            <p>
              {t("Authorization:")}
              {t(intent.authorizationRequirement)}
            </p>
            <p>
              {t("Expires:")}
              {t(formatDate(intent.expiresAt, true))}
              {t(" (UTC+08:00)")}
            </p>
          </div>
          {(intent.status === "EXPIRED" || intent.status === "CANCELLED") && (
            <p role="alert">
              {t(
                intent.status === "EXPIRED"
                  ? "This card action expired. Return to the card to prepare a new action."
                  : "This card action was cancelled. Return to the card to prepare a new action.",
              )}
            </p>
          )}
          {execute.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("Action failed: ")}
              {errorMessage(execute.error)}
              {t(
                isConflict(execute.error) &&
                  " The resource changed. Return to prepare and review a new action.",
              )}
            </p>
          )}
          {execute.isPending && (
            <p role="status">{t("Processing card action…")}</p>
          )}
          {execute.isSuccess ? (
            <p role="status">{t("Card action completed. Opening receipt…")}</p>
          ) : (
            <ActionVerification
              key={intent.id}
              completed={intent.status === "EXECUTED"}
              completedLabel="View action receipt"
              action={action}
              resourceType="CARD_ACTION_INTENT"
              resourceId={intent.id}
              resourceHash={intent.intentHash}
              label="Confirm card action"
              disabled={
                execute.isPending ||
                isConflict(execute.error) ||
                intent.status === "EXPIRED" ||
                intent.status === "CANCELLED"
              }
              onVerified={confirm}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
