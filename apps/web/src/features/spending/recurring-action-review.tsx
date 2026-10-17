"use client";
import { rememberReceipt } from "@/lib/api/receipt-navigation";
import { ActionVerification } from "@/features/security/action-verification";
import { useLocale } from "@/lib/i18n/locale";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import { useRecurringIntent, useExecuteRecurring } from "./use-spending";
import {
  Panel,
  RequestError,
  recurringHref,
  contractDisclaimer,
} from "./presentation";
export function RecurringActionReview({
  recurringPaymentId,
  intentId,
}: {
  recurringPaymentId: string;
  intentId: string;
}) {
  const { t, formatDate, errorMessage } = useLocale();

  const query = useRecurringIntent(intentId);
  const execute = useExecuteRecurring();
  const router = useRouter();
  const lock = useRef(false);
  if (query.isPending)
    return <p role="status">{t("Loading recurring payment review…")}</p>;
  if (query.isError)
    return (
      <RequestError error={query.error} retry={() => void query.refetch()} />
    );
  const intent = query.data;
  if (intent.recurringPayment.id !== recurringPaymentId)
    return (
      <RequestError
        error={new ApiError("Recurring payment intent not found.", 404, "http")}
        retry={() => void query.refetch()}
      />
    );
  const terminalError =
    execute.error instanceof ApiError &&
    execute.error.status >= 400 &&
    execute.error.status < 500 &&
    !execute.error.code?.startsWith("ACTION_AUTHORIZATION_") &&
    !execute.error.code?.startsWith("STEP_UP_") &&
    !(execute.error.status === 403 && execute.error.code === "INVALID_REQUEST");
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
        `${recurringHref(recurringPaymentId)}/actions/${encodeURIComponent(receipt.id)}`,
      );
      router.replace(
        `${recurringHref(recurringPaymentId)}/actions/${encodeURIComponent(receipt.id)}`,
      );
    } catch {
      /* The same reference and key are retained for safe retries. */
    } finally {
      lock.current = false;
    }
  };
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={recurringHref(recurringPaymentId)}
        className="text-sm text-primary"
      >
        {t("← Back to recurring payment")}
      </Link>
      <h1 className="text-3xl font-semibold">
        {t("Review future payment stop")}
      </h1>
      <Panel title={intent.recurringPayment.displayName}>
        <div>
          <h3 className="font-semibold">{t("What will stop")}</h3>
          <p className="mt-2 text-sm">{t(intent.effectDescription)}</p>
        </div>
        <div>
          <h3 className="font-semibold">{t("Current next payment")}</h3>
          <p className="mt-2 text-sm">
            {t(formatMoney(intent.recurringPayment.usualAmount))} ·{t(" ")}
            {t(
              intent.before.nextExpectedAt
                ? formatDate(intent.before.nextExpectedAt, true)
                : "No confirmed date",
            )}
          </p>
        </div>
        <div>
          <h3 className="font-semibold">{t("Effect after confirmation")}</h3>
          <p className="mt-2 text-sm" data-testid="recurring-change">
            {t(intent.before.status)} → {t(intent.after.status)}
            {t(" · No future payments under this instruction.")}
          </p>
        </div>
        <div>
          <h3 className="font-semibold">{t("What will not happen")}</h3>
          <p className="mt-2 text-sm">
            {t(
              "Historical payments will not be refunded or removed. Account balances, pending amounts and card controls will not change.",
            )}
          </p>
        </div>
        <p className="rounded-lg bg-secondary p-4 text-sm">
          {t(contractDisclaimer)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("Authorization: ")}
          {t(intent.authorizationRequirement)}
          <br />
          {t("Expires: ")}
          {t(formatDate(intent.expiresAt, true))}
          {t(" (UTC+08:00)")}
        </p>
        {intent.status === "EXPIRED" && (
          <p role="alert">
            {t(
              "This intent has expired. Return to the recurring payment to prepare a new action.",
            )}
          </p>
        )}
        {execute.isError && (
          <p role="alert">
            {t("Action failed:")}
            {errorMessage(execute.error)}
          </p>
        )}
        {execute.isPending && (
          <p role="status">{t("Processing recurring payment action…")}</p>
        )}
        {execute.isSuccess ? (
          <p role="status">{t("Future payments stopped. Opening receipt…")}</p>
        ) : (
          <ActionVerification
            key={intent.id}
            completed={intent.status === "EXECUTED"}
            completedLabel="View action receipt"
            action="RECURRING_STOP_FUTURE_PAYMENTS"
            resourceType="RECURRING_PAYMENT_INTENT"
            resourceId={intent.id}
            resourceHash={intent.intentHash}
            label="Confirm stop future payments"
            disabled={
              execute.isPending || terminalError || intent.status === "EXPIRED"
            }
            onVerified={confirm}
          />
        )}
      </Panel>
    </div>
  );
}
