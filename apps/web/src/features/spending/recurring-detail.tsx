"use client";
import { useLocale } from "@/lib/i18n/locale";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useRecurringPayment, usePrepareRecurring } from "./use-spending";
import {
  Panel,
  RequestError,
  Status,
  words,
  recurringHref,
  contractDisclaimer,
} from "./presentation";
export function RecurringDetail({
  recurringPaymentId,
}: {
  recurringPaymentId: string;
}) {
  const { t, formatDate, errorMessage } = useLocale();

  const query = useRecurringPayment(recurringPaymentId);
  const prepare = usePrepareRecurring();
  const router = useRouter();
  if (query.isPending)
    return <p role="status">{t("Loading recurring payment…")}</p>;
  if (query.isError)
    return (
      <RequestError error={query.error} retry={() => void query.refetch()} />
    );
  const payment = query.data;
  const stop = async () => {
    try {
      const intent = await prepare.mutateAsync({
        recurringPaymentId,
        actionType: "STOP_FUTURE_PAYMENTS",
      });
      router.push(
        `${recurringHref(recurringPaymentId)}/actions/review/${encodeURIComponent(intent.id)}`,
      );
    } catch {
      /* Display the API failure below. */
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app/spending" className="text-sm text-primary">
        {t("← Back to Spending")}
      </Link>
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{payment.displayName}</h1>
          <Status value={payment.status} />
        </div>
        <p className="mt-3 text-2xl font-semibold tabular-nums">
          {t(formatMoney(payment.usualAmount))}
          {t(" ")}
          <span className="text-sm font-normal text-muted-foreground">
            / {t(words(payment.frequency))}
          </span>
        </p>
      </header>
      <Panel title={t("Payment details")}>
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          {[
            ["Type", words(payment.type)],
            ["Source", words(payment.source)],
            [
              "Next expected payment",
              payment.nextExpectedAt
                ? formatDate(payment.nextExpectedAt, true)
                : payment.status === "STOPPED"
                  ? "No future payments"
                  : "No confirmed date",
            ],
            [
              "Last paid",
              payment.lastPaidAt
                ? formatDate(payment.lastPaidAt, true)
                : "No previous payment",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{t(label)}</dt>
              <dd className="mt-1 font-medium">{t(value)}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("Linked account")}
            </dt>
            <dd className="mt-1">
              <Link
                className="text-primary underline"
                href={`/app/accounts/${encodeURIComponent(payment.sourceAccountId)}`}
              >
                {t("View source account")}
              </Link>
            </dd>
          </div>
          {t(
            payment.cardId && (
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("Linked card")}
                </dt>
                <dd className="mt-1">
                  <Link
                    className="text-primary underline"
                    href={`/app/cards/${encodeURIComponent(payment.cardId)}`}
                  >
                    {t("View linked card")}
                  </Link>
                </dd>
              </div>
            ),
          )}
        </dl>
        {payment.merchant && (
          <p className="text-sm">
            {t("Merchant:")}
            {payment.merchant.name}
          </p>
        )}
        {payment.detectionProvenance && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <p>
              {t("Detected from ")}
              {payment.detectionProvenance.observedOccurrences}
              {t(" ")}
              {t("similar monthly payments.")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Observed ")}
              {t(formatDate(payment.detectionProvenance.firstObservedAt))}
              {t(" ")}—{" "}
              {t(formatDate(payment.detectionProvenance.lastObservedAt))}
              {t(". This pattern is not a bank-managed mandate.")}
            </p>
          </div>
        )}
      </Panel>
      <Panel title={t("Future payment authorization")}>
        <p className="text-xs text-muted-foreground">
          {t("Capability: ")}
          {t(words(payment.managementCapability))}
        </p>
        {payment.managementCapability === "NONE" ? (
          <p className="text-sm">
            {t(
              "This recurring payment was detected from transaction history. It cannot currently be managed through Aster Bank.",
            )}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t(contractDisclaimer)}
            </p>
            {payment.status === "ACTIVE" ? (
              <Button
                disabled={prepare.isPending || prepare.isSuccess}
                onClick={() => void stop()}
              >
                {t(prepare.isPending ? "Preparing…" : "Stop future payments")}
              </Button>
            ) : (
              <p>
                {t("No future payments are authorized under this instruction.")}
              </p>
            )}
          </>
        )}
        {prepare.isError && <p role="alert">{errorMessage(prepare.error)}</p>}
        {prepare.isPending && (
          <p role="status">{t("Preparing immutable review…")}</p>
        )}
      </Panel>
      <Panel title={t("Related payments")}>
        {payment.transactionHistory.length ? (
          <ul className="space-y-3">
            {payment.transactionHistory.map((id, index) => (
              <li key={id}>
                <Link
                  className="text-sm text-primary underline"
                  href={`/app/transactions/${encodeURIComponent(id)}`}
                >
                  {t("View ")}
                  {payment.displayName}
                  {t(" payment ")}
                  {index + 1}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("No related payments.")}</p>
        )}
      </Panel>
    </div>
  );
}
