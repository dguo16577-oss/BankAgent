"use client";
import { ActionVerification } from "@/features/security/action-verification";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n/locale";
import type { Recipient, RecipientIntent } from "@/lib/api/recipients";
import { useRecipient, useRecipientActions } from "./use-recipient-management";
import { PaymentError, fieldClass } from "./payment-ui";

function Summary({ recipient }: { recipient: Recipient }) {
  const { t } = useLocale();
  return (
    <div className="space-y-2 break-words">
      <h2 className="text-xl font-semibold">{recipient.displayName}</h2>
      <p>
        {recipient.bankName} · {recipient.maskedAccountNumber}
      </p>
      <p>
        {recipient.currency} · {t(recipient.status ?? "ACTIVE")}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("Demo destination. Account ownership is not verified.")}
      </p>
    </div>
  );
}
function Review({
  intent,
  onDone,
}: {
  intent: RecipientIntent;
  onDone: (recipient: Recipient) => void;
}) {
  const { t } = useLocale();
  const { execute } = useRecipientActions();
  const [key] = useState(() => crypto.randomUUID());
  const submit = async (actionAuthorizationId?: string) => {
    try {
      onDone(await execute.mutateAsync({ intent, key, actionAuthorizationId }));
    } catch {
      /* visible retry with same key */
    }
  };
  return (
    <Card>
      <CardContent className="space-y-5">
        <h2 className="text-xl font-semibold">{t("Review recipient")}</h2>
        <Summary recipient={intent.recipient} />
        <p>
          {t(
            intent.actionType === "CREATE"
              ? "Confirm to save this recipient. No money will move."
              : "Deactivation prevents new transfers. Past receipts stay unchanged. This cannot be undone.",
          )}
        </p>
        {execute.isError && <PaymentError error={execute.error} />}
        <ActionVerification
          key={intent.id}
          action={
            intent.actionType === "CREATE"
              ? "RECIPIENT_CREATE"
              : "RECIPIENT_DEACTIVATE"
          }
          resourceType="RECIPIENT_ACTION_INTENT"
          resourceId={intent.id}
          resourceHash={intent.intentHash}
          label={
            intent.actionType === "CREATE"
              ? "Confirm recipient"
              : "Confirm deactivation"
          }
          disabled={execute.isPending}
          onVerified={submit}
        />
      </CardContent>
    </Card>
  );
}
export function AddRecipient() {
  const { t } = useLocale();
  const { prepare } = useRecipientActions();
  const [intent, setIntent] = useState<RecipientIntent>();
  const [saved, setSaved] = useState<Recipient>();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/app/payments">{t("← Back to Payments")}</Link>
      <h1 className="text-3xl font-semibold">{t("Add recipient")}</h1>
      {saved ? (
        <Card>
          <CardContent className="space-y-4">
            <p role="status">{t("Recipient saved")}</p>
            <Summary recipient={saved} />
            <Button asChild>
              <Link
                href={`/app/payments/transfers/new?recipientId=${encodeURIComponent(saved.id)}`}
              >
                {t("Make transfer")}
              </Link>
            </Button>
            <Link
              className="block text-primary"
              href={`/app/payments/recipients/${encodeURIComponent(saved.id)}`}
            >
              {t("Recipient details")}
            </Link>
          </CardContent>
        </Card>
      ) : intent ? (
        <Review intent={intent} onDone={setSaved} />
      ) : (
        <Card>
          <CardContent>
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                const destinationRef = String(
                  new FormData(e.currentTarget).get("destinationRef") ?? "",
                );
                try {
                  setIntent(
                    await prepare.mutateAsync({
                      actionType: "CREATE",
                      destinationRef,
                    }),
                  );
                } catch {
                  /* inline */
                }
              }}
            >
              <label className="block text-sm">
                {t("Demo destination reference")}
                <input
                  name="destinationRef"
                  required
                  maxLength={100}
                  className={fieldClass}
                  aria-describedby="destination-help"
                />
              </label>
              <p
                id="destination-help"
                className="text-sm text-muted-foreground"
              >
                {t(
                  "Use demo-lin or demo-lin-savings. Do not enter a real bank account number.",
                )}
              </p>
              {prepare.isError && <PaymentError error={prepare.error} />}
              <Button disabled={prepare.isPending} type="submit">
                {t("Review recipient")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
export function RecipientDetail({ id }: { id: string }) {
  const { t } = useLocale();
  const query = useRecipient(id);
  const { prepare } = useRecipientActions();
  const [intent, setIntent] = useState<RecipientIntent>();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/app/payments">{t("← Back to Payments")}</Link>
      <h1 className="text-3xl font-semibold">{t("Recipient details")}</h1>
      {query.isPending ? (
        <p role="status">{t("Loading recipients…")}</p>
      ) : query.isError ? (
        <PaymentError error={query.error} retry={() => void query.refetch()} />
      ) : intent ? (
        <Review
          intent={intent}
          onDone={() => {
            setIntent(undefined);
            void query.refetch();
          }}
        />
      ) : (
        <Card>
          <CardContent className="space-y-5">
            <Summary recipient={query.data} />
            {query.data.status !== "INACTIVE" ? (
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link
                    href={`/app/payments/transfers/new?recipientId=${encodeURIComponent(id)}`}
                  >
                    {t("Make transfer")}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  disabled={prepare.isPending}
                  onClick={async () => {
                    try {
                      setIntent(
                        await prepare.mutateAsync({
                          actionType: "DEACTIVATE",
                          recipientId: id,
                        }),
                      );
                    } catch {
                      /* inline */
                    }
                  }}
                >
                  {t("Deactivate recipient")}
                </Button>
              </div>
            ) : (
              <p role="status">
                {t("Recipient deactivated. Past transfers remain available.")}
              </p>
            )}
            {prepare.isError && <PaymentError error={prepare.error} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
