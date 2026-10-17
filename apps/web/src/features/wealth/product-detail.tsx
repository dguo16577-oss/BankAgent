"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useProduct, useRiskProfile, useCreateSuitability } from "./use-wealth";
import {
  Panel,
  WealthError,
  Fields,
  SuitabilityEvidence,
  productTypes,
  productHref,
} from "./wealth-ui";
export function ProductDetail({ productId }: { productId: string }) {
  const { t, errorMessage } = useLocale();

  const product = useProduct(productId),
    risk = useRiskProfile(),
    check = useCreateSuitability();
  if (product.isPending)
    return <p role="status">{t("Loading investment product…")}</p>;
  if (product.isError)
    return (
      <WealthError error={product.error} retry={() => void product.refetch()} />
    );
  const p = product.data;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app/wealth" className="text-sm text-primary">
        {t("← Back to Wealth")}
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {t("Simulated investment product")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{p.displayName}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t(p.description)}</p>
      </header>
      <Panel title={t("Product information")}>
        <Fields
          items={[
            ["Type", productTypes[p.type]],
            ["Product risk", p.riskLevel],
            ["Minimum investment", formatMoney(p.minimumInvestment)],
            ["Purchase fee", formatMoney(p.fees)],
            ["Currency", p.currency],
            ["Availability", p.status],
          ]}
        />
        <div className="space-y-2 text-sm">
          <h3 className="font-semibold">
            {t("Illustrative yield: ")}
            {t(p.indicativeYield)}%
          </h3>
          <p className="text-muted-foreground">{t(p.performanceSummary)}</p>
          <h3 className="pt-2 font-semibold">{t("Liquidity")}</h3>
          <p className="text-muted-foreground">{t(p.liquidity)}</p>
        </div>
        <p className="rounded-xl bg-secondary p-4 text-sm">{t(p.disclaimer)}</p>
      </Panel>
      <Panel title={t("Suitability")}>
        {risk.isPending ? (
          <p role="status">{t("Loading risk profile…")}</p>
        ) : risk.isError ? (
          <WealthError error={risk.error} retry={() => void risk.refetch()} />
        ) : (
          <p className="text-sm">
            {t("Your risk level: ")}
            {t(risk.data.riskLevel)}
            {t(" · Product risk:")}
            {t(p.riskLevel)}
          </p>
        )}
        {check.data && <SuitabilityEvidence check={check.data} />}
        {check.isError && <p role="alert">{errorMessage(check.error)}</p>}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={
              check.isPending ||
              risk.isPending ||
              risk.isError ||
              p.status !== "AVAILABLE"
            }
            onClick={() => check.mutate({ productId })}
          >
            {t(
              check.isPending
                ? "Checking suitability…"
                : check.data
                  ? "Refresh suitability check"
                  : "Check suitability",
            )}
          </Button>
          {check.data?.result === "SUITABLE" && p.status === "AVAILABLE" ? (
            <Button asChild>
              <Link
                href={`${productHref(productId)}/invest?suitabilityCheckId=${encodeURIComponent(check.data.id)}`}
              >
                {t("Invest")}
              </Link>
            </Button>
          ) : (
            <Button disabled>{t("Invest unavailable")}</Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
