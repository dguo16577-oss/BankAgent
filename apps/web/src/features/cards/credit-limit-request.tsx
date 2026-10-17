"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ActionVerification } from "@/features/security/action-verification";
import { useLocale } from "@/lib/i18n/locale";
import {
  cancelCreditLimit,
  listCreditLimitApplications,
  prepareCreditLimit,
  submitCreditLimit,
  type CreditLimitApplication,
  type CreditLimitIntent,
} from "@/lib/api/cards";

export function CreditLimitRequest({ cardId }: { cardId: string }) {
  const { t, errorMessage } = useLocale();
  const client = useQueryClient();
  const [requestedLimit, setRequestedLimit] = useState("");
  const [intent, setIntent] = useState<CreditLimitIntent>();
  const [submitted, setSubmitted] = useState<CreditLimitApplication>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const applications = useQuery({
    queryKey: ["credit-limit-applications"],
    queryFn: ({ signal }) => listCreditLimitApplications(signal),
    retry: false,
  });

  async function prepare() {
    setBusy(true);
    setError(undefined);
    try {
      setIntent(await prepareCreditLimit(cardId, requestedLimit));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure : new Error("Request failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!intent) return;
    setBusy(true);
    setError(undefined);
    try {
      await cancelCreditLimit(intent.id);
      setIntent(undefined);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure : new Error("Request failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(actionAuthorizationId?: string) {
    if (!intent || !actionAuthorizationId) return;
    setBusy(true);
    setError(undefined);
    try {
      const application = await submitCreditLimit(
        intent,
        actionAuthorizationId,
      );
      setSubmitted(application);
      setIntent(undefined);
      await client.invalidateQueries({
        queryKey: ["credit-limit-applications"],
      });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure : new Error("Request failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <h2 className="font-semibold">
          {t("Request a credit limit increase")}
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "Submitting a request starts bank review. Your granted credit limit does not change until the bank approves it.",
          )}
        </p>
        {intent ? (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-sm">
              {t("Current granted limit")}: {intent.currentLimit} CNY
            </p>
            <p className="font-medium">
              {t("Requested limit")}: {intent.requestedLimit} CNY
            </p>
            <ActionVerification
              key={intent.id}
              action="CREDIT_LIMIT_APPLICATION_SUBMIT"
              resourceType="CREDIT_LIMIT_INTENT"
              resourceId={intent.id}
              resourceHash={intent.intentHash}
              label="Submit request for bank review"
              disabled={busy}
              onVerified={submit}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {t("Cancel and change request")}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void prepare();
            }}
          >
            <label className="block text-sm font-medium">
              {t("Requested credit limit (CNY)")}
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={requestedLimit}
                onChange={(event) => setRequestedLimit(event.target.value)}
                className="mt-1 block w-full rounded-md border bg-background px-3 py-2"
              />
            </label>
            <Button disabled={busy}>{t("Review credit limit request")}</Button>
          </form>
        )}
        {submitted && (
          <p role="status" className="text-sm">
            {t("Request submitted for bank review")}: {submitted.id} ·{" "}
            {t(submitted.status)}
          </p>
        )}
        {error !== undefined && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        )}
        {applications.data?.items
          .filter((item) => item.cardId === cardId)
          .map((item) => (
            <p key={item.id} className="border-t pt-3 text-sm">
              {item.requestedLimit} CNY · {t(item.status)}
            </p>
          ))}
      </CardContent>
    </Card>
  );
}
