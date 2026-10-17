"use client";
import { rememberReceipt } from "@/lib/api/receipt-navigation";
import { ActionVerification } from "@/features/security/action-verification";
import { useLocale } from "@/lib/i18n/locale";

import { isConflict } from "@/lib/api/conflict";
import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { useExecuteTransfer, useTransferIntent } from "./use-payments";
import { Fields, ResourceError } from "./payment-ui";
export function TransferReview({ intentId }: { intentId: string }) {
  const { t, formatDate, errorMessage } = useLocale();

  const query = useTransferIntent(intentId);
  const execute = useExecuteTransfer();
  const router = useRouter();
  const locked = useRef(false);
  if (query.isPending)
    return <p role="status">{t("Loading transfer review…")}</p>;
  if (query.isError)
    return (
      <ResourceError error={query.error} retry={() => void query.refetch()} />
    );
  const intent = query.data;
  const confirm = async (actionAuthorizationId?: string) => {
    if (locked.current || execute.isSuccess) return;
    locked.current = true;
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
        `/app/payments/transfers/${encodeURIComponent(receipt.id)}`,
      );
      router.replace(
        `/app/payments/transfers/${encodeURIComponent(receipt.id)}`,
      );
    } catch {
      /* Keep the same key and exact request for uncertain-outcome retry. */
    } finally {
      locked.current = false;
    }
  };
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/app/payments/transfers/new" className="text-sm text-primary">
        {t("← Start a new transfer")}
      </Link>
      <div>
        <h1 className="text-3xl font-semibold">{t("Review transfer")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Check these exact details before confirming.")}
        </p>
      </div>
      <Card className="shadow-none">
        <CardContent className="space-y-7">
          <p className="text-4xl font-semibold" data-testid="review-amount">
            {t(formatMoney(intent.amount))}
          </p>
          <Fields
            items={[
              [
                "From",
                `${intent.sourceAccount.displayName} · ${intent.sourceAccount.maskedAccountNumber}`,
              ],
              [
                "To",
                `${intent.recipient.displayName} · ${intent.recipient.maskedAccountNumber}`,
              ],
              ["Bank", intent.recipient.bankName],
              ["Amount", formatMoney(intent.amount)],
              ["Fee", formatMoney(intent.fee)],
              ["Total debit", formatMoney(intent.totalDebit)],
              [
                "Projected available balance",
                formatMoney(intent.projectedAvailableBalance),
              ],
              ["Note", intent.note || t("None")],
              ["Expires", `${formatDate(intent.expiresAt, true)} (UTC+08:00)`],
            ]}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              "This is a saved review snapshot. Available funds and eligibility are checked again when you confirm by the banking service.",
            )}
          </p>
          {intent.status !== "PREPARED" ? (
            <p role="status">
              {t("This intent is ")}
              {t(intent.status.toLowerCase())}.{t(" ")}
              {t(
                intent.status === "EXPIRED"
                  ? "Start a new transfer."
                  : "Use the original confirmation key to recover your receipt.",
              )}
            </p>
          ) : null}
          {execute.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("Transfer failed: ")}
              {errorMessage(execute.error)}
              {t(
                isConflict(execute.error) &&
                  " The resource changed. Return to prepare and review a new action.",
              )}
            </p>
          )}
          {execute.isPending && (
            <p role="status">{t("Processing transfer…")}</p>
          )}
          {execute.isSuccess ? (
            <p role="status">{t("Transfer completed. Opening receipt…")}</p>
          ) : (
            <ActionVerification
              key={intent.id}
              completed={intent.status === "EXECUTED"}
              completedLabel="View completed receipt"
              action="TRANSFER_EXECUTE"
              resourceType="TRANSFER_INTENT"
              resourceId={intent.id}
              resourceHash={intent.intentHash}
              label="Confirm transfer"
              disabled={execute.isPending || intent.status === "EXPIRED"}
              onVerified={confirm}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
