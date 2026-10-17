"use client";
import { useLocale } from "@/lib/i18n/locale";
import Link from "next/link";
import type { ReactNode } from "react";
import type { components } from "@/generated/customer-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";

export const productTypes = {
  MONEY_MARKET: "Money market",
  BOND_FUND: "Bond fund",
  BALANCED_FUND: "Balanced fund",
  EQUITY_FUND: "Equity fund",
} satisfies Record<components["schemas"]["InvestmentProductType"], string>;
export const riskLevels: components["schemas"]["RiskLevel"][] = [
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
];
export const productHref = (id: string) =>
  `/app/wealth/products/${encodeURIComponent(id)}`;
export const fieldClass =
  "mt-2 block w-full min-w-0 rounded-lg border bg-white px-3 py-2.5 text-sm";
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = useLocale();

  return (
    <Card className="min-w-0 shadow-none">
      <CardContent className="space-y-5">
        <h2 className="text-lg font-semibold">{t(title)}</h2>
        {t(children)}
      </CardContent>
    </Card>
  );
}
export function Fields({ items }: { items: [string, ReactNode][] }) {
  const { t } = useLocale();

  return (
    <dl className="grid gap-5 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs text-muted-foreground">{t(label)}</dt>
          <dd className="mt-1 break-words font-medium">
            {[
              "Status",
              "Product type",
              "Type",
              "Availability",
              "Suitability result",
              "Liquidity",
            ].includes(label)
              ? t(value)
              : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function WealthError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  const { t, errorMessage } = useLocale();

  return (
    <div className="space-y-4 rounded-xl border bg-white p-5">
      <p role="alert">{errorMessage(error)}</p>
      {error instanceof ApiError && error.status === 404 ? (
        <Link href="/app/wealth" className="text-primary underline">
          {t("Back to Wealth")}
        </Link>
      ) : (
        <Button variant="outline" onClick={retry}>
          {t("Retry")}
        </Button>
      )}
    </div>
  );
}
export function SuitabilityEvidence({
  check,
}: {
  check: components["schemas"]["SuitabilityCheck"];
}) {
  const { t, formatDate } = useLocale();

  return (
    <div
      className={`space-y-3 rounded-xl border p-4 text-sm ${check.result === "SUITABLE" ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}
    >
      <p data-testid="suitability-result" className="font-semibold">
        {t(check.result)}
      </p>
      <p>
        {t("Your risk level: ")}
        {t(check.userRiskLevel)}
        {t(" · Product risk:")}
        {t(" ")}
        {t(check.productRiskLevel)}
      </p>
      {check.reasons.map((reason) => (
        <p key={reason}>{t(reason)}</p>
      ))}
      <p className="text-xs text-muted-foreground">
        {t("Evidence expires ")}
        {t(formatDate(check.expiresAt, true))}
        {t(" (UTC+08:00). Eligibility is checked again before execution.")}
      </p>
    </div>
  );
}
