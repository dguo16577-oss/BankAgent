"use client";
import { ActionVerification } from "@/features/security/action-verification";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n/locale";
import { formatMoney } from "@/lib/money";
import type {
  Schedule,
  ScheduleIntent,
  PrepareSchedule,
} from "@/lib/api/schedules";
import { useAccounts } from "@/features/accounts/use-accounts";
import { useRecipients } from "./use-payments";
import { useSchedule, useSchedules, useScheduleActions } from "./use-schedules";
import { PaymentError, fieldClass, Fields } from "./payment-ui";

function Notice() {
  const { t } = useLocale();
  return (
    <p className="text-sm text-muted-foreground">
      {t(
        "One-time CNY payment. Funds are not reserved. Demo schedules require the local processor; automatic arrival is not guaranteed.",
      )}
    </p>
  );
}
function Summary({ schedule: p }: { schedule: Schedule }) {
  const { t, formatDate } = useLocale();
  return (
    <Fields
      items={[
        [
          "Recipient",
          `${p.recipient.displayName} · ${p.recipient.maskedAccountNumber}`,
        ],
        ["Source account", p.sourceAccount.displayName],
        ["Amount", formatMoney(p.amount)],
        ["Fee", formatMoney(p.fee)],
        ["Total debit", formatMoney(p.totalDebit)],
        [
          "Execution time",
          `${formatDate(p.dueAt, true)} · Asia/Shanghai (UTC+08:00)`,
        ],
        ["Status", t(p.status)],
      ]}
    />
  );
}
export function ScheduledList() {
  const { t } = useLocale();
  const query = useSchedules();
  return (
    <div className="space-y-6">
      <Link href="/app/payments" className="text-primary">
        {t("Back to Payments")}
      </Link>
      <h1 className="text-3xl font-semibold">{t("Scheduled payments")}</h1>
      <Notice />
      <Button asChild>
        <Link href="/app/payments/scheduled/new">{t("Schedule payment")}</Link>
      </Button>
      {query.isPending ? (
        <p role="status">{t("Loading…")}</p>
      ) : query.isError ? (
        <PaymentError error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {query.data.items.map((p) => (
            <Card key={p.id} className="min-w-0">
              <CardContent className="space-y-4">
                <Link
                  className="font-semibold text-primary"
                  href={`/app/payments/scheduled/${encodeURIComponent(p.id)}`}
                >
                  {p.recipient.displayName}
                </Link>
                <Summary schedule={p} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p>{t("No scheduled payments yet.")}</p>
      )}
    </div>
  );
}
function Review({
  intent,
  onBack,
}: {
  intent: ScheduleIntent;
  onBack: () => void;
}) {
  const { t } = useLocale();
  const actions = useScheduleActions();
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  async function confirm(actionAuthorizationId?: string) {
    try {
      const p = await actions.confirm.mutateAsync({
        intent,
        key,
        actionAuthorizationId,
      });
      onBack();
      router.push(`/app/payments/scheduled/${encodeURIComponent(p.id)}`);
    } catch {
      /* error remains visible; same key on retry */
    }
  }
  return (
    <Card>
      <CardContent className="space-y-5">
        <h2 className="text-xl font-semibold">
          {t("Review scheduled payment")}
        </h2>
        <Summary schedule={intent.schedule} />
        <p>
          {t(
            intent.actionType === "CANCEL"
              ? "Confirm cancellation. No money will move; the instruction remains in your history."
              : "Confirm these future payment terms. No money will move now. Insufficient funds at execution will fail the payment.",
          )}
        </p>
        {actions.confirm.isError && (
          <PaymentError error={actions.confirm.error} />
        )}
        <div className="flex flex-wrap gap-3">
          <ActionVerification
            key={intent.id}
            action={
              intent.actionType === "CANCEL"
                ? "SCHEDULED_PAYMENT_CANCEL"
                : intent.actionType === "CREATE"
                  ? "SCHEDULED_PAYMENT_CREATE"
                  : "SCHEDULED_PAYMENT_MODIFY"
            }
            resourceType="SCHEDULE_ACTION_INTENT"
            resourceId={intent.id}
            resourceHash={intent.intentHash}
            label={
              intent.actionType === "CANCEL"
                ? "Confirm cancellation"
                : "Confirm schedule"
            }
            disabled={actions.confirm.isPending}
            onVerified={confirm}
          />
          <Button
            variant="outline"
            onClick={onBack}
            disabled={actions.confirm.isPending}
          >
            {t("Back")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
export function ScheduleForm({ existing }: { existing?: Schedule }) {
  const { t } = useLocale();
  const accounts = useAccounts();
  const recipients = useRecipients();
  const actions = useScheduleActions();
  const [intent, setIntent] = useState<ScheduleIntent>();
  if (intent)
    return <Review intent={intent} onBack={() => setIntent(undefined)} />;
  if (accounts.isPending || recipients.isPending)
    return <p role="status">{t("Loading…")}</p>;
  if (accounts.isError)
    return (
      <PaymentError
        error={accounts.error}
        retry={() => void accounts.refetch()}
      />
    );
  if (recipients.isError)
    return (
      <PaymentError
        error={recipients.error}
        retry={() => void recipients.refetch()}
      />
    );
  const date = existing
    ? new Date(Date.parse(existing.dueAt) + 8 * 3600_000)
        .toISOString()
        .slice(0, 16)
    : "";
  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = String(data.get("amount"));
    const body: PrepareSchedule = {
      actionType: existing ? "AMEND" : "CREATE",
      ...(existing
        ? { scheduleId: existing.id, expectedVersion: existing.version }
        : {}),
      sourceAccountId:
        existing?.sourceAccount.id ?? String(data.get("account")),
      recipientId: String(data.get("recipient")),
      amount: {
        amount: amount.includes(".")
          ? amount.padEnd(amount.indexOf(".") + 3, "0")
          : `${amount}.00`,
        currency: "CNY",
      },
      dueAt: `${data.get("dueAt")}:00+08:00`,
      note: String(data.get("note") ?? ""),
    };
    try {
      setIntent(await actions.prepare.mutateAsync(body));
    } catch {
      /* visible error */
    }
  }
  return (
    <div className="space-y-6">
      <Link
        className="text-primary"
        href={
          existing
            ? `/app/payments/scheduled/${existing.id}`
            : "/app/payments/scheduled"
        }
      >
        {t("Back to scheduled payments")}
      </Link>
      <h1 className="text-3xl font-semibold">
        {t(existing ? "Modify scheduled payment" : "Schedule payment")}
      </h1>
      <Notice />
      <form onSubmit={prepare} className="max-w-xl min-w-0 space-y-5">
        <label className="block">
          {t("Source account")}
          <select
            aria-label={t("Source account")}
            name="account"
            className={fieldClass}
            defaultValue={existing?.sourceAccount.id}
            disabled={Boolean(existing)}
            required
          >
            {accounts.data.accounts
              .filter((a) => a.currency === "CNY" && a.status === "ACTIVE")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} · {a.maskedAccountNumber}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          {t("Recipient")}
          <select
            aria-label={t("Recipient")}
            name="recipient"
            className={fieldClass}
            defaultValue={existing?.recipient.id}
            required
          >
            {recipients.data.items
              .filter((r) => r.status !== "INACTIVE")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName} · {r.maskedAccountNumber}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          {t("Amount (CNY)")}
          <input
            name="amount"
            className={fieldClass}
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,2})?"
            defaultValue={existing?.amount.amount}
            required
          />
        </label>
        <label className="block">
          {t("Execution time (Asia/Shanghai, UTC+08:00)")}
          <input
            name="dueAt"
            type="datetime-local"
            className={fieldClass}
            defaultValue={date}
            required
          />
        </label>
        <label className="block">
          {t("Note")}
          <input
            name="note"
            maxLength={140}
            className={fieldClass}
            defaultValue={existing?.note}
          />
        </label>
        {actions.prepare.isError && (
          <PaymentError error={actions.prepare.error} />
        )}
        <Button disabled={actions.prepare.isPending}>
          {t("Review scheduled payment")}
        </Button>
      </form>
    </div>
  );
}
export function ScheduledDetail({
  id,
  edit = false,
}: {
  id: string;
  edit?: boolean;
}) {
  const { t } = useLocale();
  const query = useSchedule(id);
  const actions = useScheduleActions();
  const [intent, setIntent] = useState<ScheduleIntent>();
  if (query.isPending) return <p role="status">{t("Loading…")}</p>;
  if (query.isError)
    return (
      <PaymentError error={query.error} retry={() => void query.refetch()} />
    );
  if (intent)
    return <Review intent={intent} onBack={() => setIntent(undefined)} />;
  const p = query.data;
  if (edit && p.status === "SCHEDULED") return <ScheduleForm existing={p} />;
  async function cancel() {
    try {
      setIntent(
        await actions.prepare.mutateAsync({
          actionType: "CANCEL",
          scheduleId: p.id,
          expectedVersion: p.version,
        }),
      );
    } catch {
      /* visible error */
    }
  }
  return (
    <div className="space-y-6">
      <Link href="/app/payments/scheduled" className="text-primary">
        {t("Back to scheduled payments")}
      </Link>
      <h1 className="text-3xl font-semibold">{t("Scheduled payment")}</h1>
      <Notice />
      <Card>
        <CardContent className="space-y-5">
          <Summary schedule={p} />
          {p.status === "SCHEDULED" && (
            <>
              <p>
                {t(
                  "No funds have been debited or reserved. Changes and cancellation must be confirmed before the execution time.",
                )}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link
                    href={`/app/payments/scheduled/${encodeURIComponent(id)}/edit`}
                  >
                    {t("Modify schedule")}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void cancel()}
                  disabled={actions.prepare.isPending}
                >
                  {t("Cancel schedule")}
                </Button>
              </div>
            </>
          )}
          {p.status === "FAILED" && (
            <p role="status">
              {t("Execution failed")}:{" "}
              {t(p.failureReason ?? "SCHEDULE_TERMS_INVALID")}
            </p>
          )}
          {p.status === "EXECUTED" && p.transferId && (
            <Link
              className="text-primary"
              href={`/app/payments/transfers/${encodeURIComponent(p.transferId)}`}
            >
              {t("View transfer receipt")}
            </Link>
          )}
          {p.status === "CANCELLED" && (
            <p>{t("Cancelled. No payment was made.")}</p>
          )}
          {actions.prepare.isError && (
            <PaymentError error={actions.prepare.error} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
