"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { ApiError } from "@/lib/api/client";

import { useRecurringAction } from "./use-spending";
import {
  Panel,
  Status,
  RequestError,
  recurringHref,
  contractDisclaimer,
} from "./presentation";
export function RecurringActionReceipt({
  recurringPaymentId,
  actionId,
}: {
  recurringPaymentId: string;
  actionId: string;
}) {
  const { t, formatDate } = useLocale();

  const query = useRecurringAction(actionId);
  if (query.isPending)
    return <p role="status">{t("Loading recurring payment receipt…")}</p>;
  if (query.isError)
    return (
      <RequestError error={query.error} retry={() => void query.refetch()} />
    );
  const receipt = query.data;
  if (receipt.recurringPayment.id !== recurringPaymentId)
    return (
      <RequestError
        error={new ApiError("Recurring payment action not found.", 404, "http")}
        retry={() => void query.refetch()}
      />
    );
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold">{t("Future payments stopped")}</h1>
      <Panel title={receipt.recurringPayment.displayName}>
        <Status value={receipt.after.status} />
        <p className="text-sm">{t(receipt.effectDescription)}</p>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("Effective at")}</dt>
            <dd>
              {t(formatDate(receipt.effectiveAt, true))}
              {t(" (UTC+08:00)")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("Action reference")}</dt>
            <dd className="break-all font-mono">{receipt.reference}</dd>
          </div>
        </dl>
        <p className="rounded-lg bg-secondary p-4 text-sm">
          {t(contractDisclaimer)}
        </p>
        <Link
          className="inline-flex text-primary underline"
          href={recurringHref(recurringPaymentId)}
        >
          {t("View recurring payment")}
        </Link>
      </Panel>
      <Link href="/app/overview" className="text-primary underline">
        {t("Back to Overview")}
      </Link>
    </div>
  );
}
