"use client";
import { rememberReceipt } from "@/lib/api/receipt-navigation";
import { ActionVerification } from "@/features/security/action-verification";
import { useLocale } from "@/lib/i18n/locale";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import { useInvestmentIntent, useExecuteInvestment } from "./use-wealth";
import { Panel, Fields, WealthError, productHref } from "./wealth-ui";
import { Button } from "@/components/ui/button";
export function InvestmentReview({
  intentId,
  inline = false,
  onBack,
}: {
  intentId: string;
  inline?: boolean;
  onBack?: () => void;
}) {
  const { t, formatDate, errorMessage } = useLocale();

  const query = useInvestmentIntent(intentId),
    execute = useExecuteInvestment(),
    router = useRouter();
  const lock = useRef(false);
  if (query.isPending)
    return <p role="status">{t("Loading investment review…")}</p>;
  if (query.isError)
    return (
      <WealthError error={query.error} retry={() => void query.refetch()} />
    );
  const intent = query.data;
  const confirm = async (actionAuthorizationId?: string) => {
    if (lock.current || execute.isSuccess) return;
    lock.current = true;
    try {
      const receipt = await execute.mutateAsync({
        request: {
          intentId: intent.id,
          intentHash: intent.intentHash,
          actionAuthorizationId,
        },
        key: `confirm_${intent.id}`,
      });
      rememberReceipt(
        intent.id,
        `/app/wealth/orders/${encodeURIComponent(receipt.id)}`,
      );
      router.replace(`/app/wealth/orders/${encodeURIComponent(receipt.id)}`);
    } catch {
      /* Retain exact request/key for retry after an uncertain response. */
    } finally {
      lock.current = false;
    }
  };
  const terminal =
    execute.error instanceof ApiError &&
    execute.error.status >= 400 &&
    execute.error.status < 500 &&
    !execute.error.code?.startsWith("ACTION_AUTHORIZATION_") &&
    !execute.error.code?.startsWith("STEP_UP_") &&
    !(execute.error.status === 403 && execute.error.code === "INVALID_REQUEST");
  return (
    <div className="max-w-2xl space-y-6">
      {inline ? (
        <Button type="button" variant="outline" onClick={onBack}>
          {t("← Back to investment form")}
        </Button>
      ) : (
        <Link
          href={productHref(intent.product.id)}
          className="text-sm text-primary"
        >
          {t("← Back to product")}
        </Link>
      )}
      {inline ? (
        <h3 className="text-xl font-semibold">{t("Review investment")}</h3>
      ) : (
        <h1 className="text-3xl font-semibold">{t("Review investment")}</h1>
      )}
      <Panel title={intent.product.displayName}>
        <p
          className="text-4xl font-semibold tabular-nums"
          data-testid="investment-review-amount"
        >
          {t(formatMoney(intent.amount))}
        </p>
        <Fields
          items={[
            ["Product risk", intent.product.riskLevel],
            ["Your risk level", intent.suitability.userRiskLevel],
            ["Suitability result", intent.suitability.result],
            [
              "Source account",
              `${intent.sourceAccount.displayName} · ${intent.sourceAccount.maskedAccountNumber}`,
            ],
            ["Investment amount", formatMoney(intent.amount)],
            ["Fee", formatMoney(intent.fees)],
            ["Total debit", formatMoney(intent.totalDebit)],
            [
              "Projected available balance",
              formatMoney(intent.projectedAvailableBalance),
            ],
            ["Intent expires", formatDate(intent.expiresAt, true)],
            [
              "Suitability expires",
              formatDate(intent.suitability.expiresAt, true),
            ],
          ]}
        />
        <p className="rounded-xl bg-secondary p-4 text-sm">
          {t(intent.product.disclaimer)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            "You are confirming this saved snapshot. All prerequisites are checked again before execution. Times use UTC+08:00.",
          )}
        </p>
        {intent.status === "EXPIRED" && (
          <p role="alert">
            {t(
              "This intent has expired. Return to the product and prepare a new order.",
            )}
          </p>
        )}
        {execute.isError && (
          <p role="alert">
            {t("Investment failed:")}
            {errorMessage(execute.error)}
          </p>
        )}
        {execute.isPending && (
          <p role="status">{t("Processing investment order…")}</p>
        )}
        {execute.isSuccess ? (
          <p role="status">{t("Investment completed. Opening receipt…")}</p>
        ) : (
          <ActionVerification
            key={intent.id}
            completed={intent.status === "EXECUTED"}
            completedLabel="View completed receipt"
            action="INVESTMENT_ORDER_EXECUTE"
            resourceType="INVESTMENT_ORDER_INTENT"
            resourceId={intent.id}
            resourceHash={intent.intentHash}
            label="Confirm investment"
            disabled={
              execute.isPending || terminal || intent.status === "EXPIRED"
            }
            onVerified={confirm}
          />
        )}
      </Panel>
    </div>
  );
}
