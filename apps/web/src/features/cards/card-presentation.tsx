"use client";
import { useLocale } from "@/lib/i18n/locale";
import Link from "next/link";
import { CreditCard, Snowflake } from "lucide-react";
import type {
  CardSummary,
  CardControls,
  CardActionIntent,
} from "@/lib/api/cards";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
export const controlLabels = {
  onlinePayments: "Online payments",
  internationalPayments: "International payments",
  atmWithdrawals: "ATM withdrawals",
  contactless: "Contactless",
} satisfies Record<keyof CardControls, string>;
export const actionLabels = {
  FREEZE: "Freeze card",
  UNFREEZE: "Unfreeze card",
  REPORT_LOST: "Report card lost",
  UPDATE_LIMITS: "Update card limits",
  UPDATE_CONTROLS: "Update card controls",
};
export function CardVisual({ card }: { card: CardSummary }) {
  const { t } = useLocale();

  return (
    <div
      className={`min-w-0 rounded-2xl border p-6 ${card.type === "DEBIT" ? "border-primary bg-primary text-primary-foreground" : "border-teal-200 bg-teal-50 text-primary"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold tracking-widest">
          {t("ASTER BANK")}
        </span>
        {card.status === "FROZEN" ? (
          <Snowflake aria-hidden="true" size={24} />
        ) : (
          <CreditCard aria-hidden="true" size={24} />
        )}
      </div>
      <p className="my-8 break-words text-2xl font-medium tracking-[.2em]">
        {card.maskedNumber}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3 text-xs">
        <span>{card.displayName}</span>
        <span className="font-semibold tracking-wider">{t(card.scheme)}</span>
      </div>
    </div>
  );
}
export function CardStatus({ status }: { status: CardSummary["status"] }) {
  const { t } = useLocale();

  return (
    <span
      data-testid="card-status"
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : status === "FROZEN" ? "bg-sky-50 text-sky-800" : "bg-muted text-muted-foreground"}`}
    >
      {t(status)}
    </span>
  );
}
export function CardError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  const { t, errorMessage } = useLocale();

  if (error instanceof ApiError && error.status === 404)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">
          {t(
            error.code === "CARD_NOT_FOUND"
              ? "Card not found"
              : "Card action not found",
          )}
        </h1>
        <p>{t("This resource is unavailable in this demo session.")}</p>
        <Link href="/app/cards" className="text-primary underline">
          {t("Back to Cards")}
        </Link>
      </div>
    );
  return (
    <Card>
      <CardContent className="space-y-4">
        <p role="alert">{errorMessage(error)}</p>
        <Button variant="outline" onClick={retry}>
          {t("Retry")}
        </Button>
      </CardContent>
    </Card>
  );
}
export function ExactChanges({
  before,
  after,
}: {
  before: CardActionIntent["before"];
  after: CardActionIntent["after"];
}) {
  const { t } = useLocale();

  const rows: [string, string, string][] = [
    ["Card status", before.status, after.status],
    ...(before.limits && after.limits
      ? ([
          [
            "Per transaction limit (CNY)",
            before.limits.perTransaction,
            after.limits.perTransaction,
          ],
          ["Daily limit (CNY)", before.limits.daily, after.limits.daily],
          [
            "Bank maximum per transaction (CNY)",
            before.limits.bankMaxPerTransaction,
            after.limits.bankMaxPerTransaction,
          ],
          [
            "Bank maximum daily (CNY)",
            before.limits.bankMaxDaily,
            after.limits.bankMaxDaily,
          ],
        ] as [string, string, string][])
      : []),
    ...Object.entries(controlLabels).map(
      ([key, label]): [string, string, string] => [
        label,
        before.controls[key as keyof CardControls] ? "ON" : "OFF",
        after.controls[key as keyof CardControls] ? "ON" : "OFF",
      ],
    ),
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-xs font-semibold text-muted-foreground">
        <span>{t("Capability")}</span>
        <span>{t("Before")}</span>
        <span>{t("After")}</span>
      </div>
      {rows.map(([label, before, after]) => (
        <div
          data-testid="card-change"
          key={label}
          className={`grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-lg px-0 py-3 text-sm ${before !== after ? "font-medium text-primary" : "text-muted-foreground"}`}
        >
          <span>{t(label)}</span>
          <span className="break-all">{t(before)}</span>
          <span className="break-all">
            {t(after)}
            {before !== after && (
              <span className="mt-1 block text-[10px] font-normal">
                {t("Changed")}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
