"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { usePortfolio, useRiskProfile } from "./use-wealth";
import { Panel, WealthError, productTypes, productHref } from "./wealth-ui";
import { ProductCatalog } from "./product-catalog";
export function WealthDashboard() {
  const { t, formatDate } = useLocale();

  const portfolio = usePortfolio(),
    risk = useRiskProfile();
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {t("Your investment workspace")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {t("Wealth")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Explore your demo portfolio and fictional investment products.")}
        </p>
      </header>
      {portfolio.isPending ? (
        <p role="status">{t("Loading portfolio…")}</p>
      ) : portfolio.isError ? (
        <WealthError
          error={portfolio.error}
          retry={() => void portfolio.refetch()}
        />
      ) : (
        <>
          <Panel title={t("Portfolio total")}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p
                  data-testid="portfolio-total"
                  className="text-4xl font-semibold tracking-tight tabular-nums"
                >
                  {t(formatMoney(portfolio.data.totalValue))}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("SIMULATED · ")}
                  {t(formatDate(portfolio.data.asOf, true))}
                  {t(" ")}
                  {t("(UTC+08:00)")}
                </p>
              </div>
              <div className="rounded-xl bg-secondary px-4 py-3 text-sm">
                <p className="font-semibold">
                  {t("Demo monthly change")}
                  {t(" ")}
                  {t(formatMoney(portfolio.data.monthlyChange, true))}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t(portfolio.data.monthlyChangePercent ?? "—")}
                  {t("% · Net contributions")}
                  {t(" ")}
                  {t(formatMoney(portfolio.data.monthlyNetContributions))}
                </p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(portfolio.data.performanceSummary)}
            </p>
          </Panel>
          <Panel title={t("Your positions")}>
            {!portfolio.data.positions.length ? (
              <p>{t("No investment positions yet.")}</p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-3">
                {portfolio.data.positions.map((p) => (
                  <div
                    key={p.id}
                    data-testid="portfolio-position"
                    className="min-w-0 rounded-xl border p-5"
                  >
                    <p className="text-xs text-muted-foreground">
                      {t(productTypes[p.type])}
                    </p>
                    <h3 className="mt-2 font-semibold">{p.displayName}</h3>
                    <p className="mt-4 text-2xl font-semibold tabular-nums">
                      {t(formatMoney(p.currentValue))}
                    </p>
                    <dl className="mt-4 space-y-2 text-xs">
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-muted-foreground">
                          {t("Invested")}
                        </dt>
                        <dd>{t(formatMoney(p.investedAmount))}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-muted-foreground">
                          {t("Demo gain/loss")}
                        </dt>
                        <dd>{t(formatMoney(p.gainLoss, true))}</dd>
                      </div>
                    </dl>
                    {p.productId ? (
                      <Link
                        href={productHref(p.productId)}
                        className="mt-4 inline-flex text-xs text-primary underline"
                      >
                        {t("View product")}
                      </Link>
                    ) : (
                      <p className="mt-4 text-xs text-muted-foreground">
                        {t("Existing holding · No purchase available")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
      <Panel title={t("Your risk profile")}>
        {risk.isPending ? (
          <p role="status">{t("Loading risk profile…")}</p>
        ) : risk.isError ? (
          <WealthError error={risk.error} retry={() => void risk.refetch()} />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="rounded-xl bg-primary px-5 py-3 text-xl font-semibold text-primary-foreground">
              {t(risk.data.riskLevel)}
            </span>
            <div>
              <p className="font-medium">
                {risk.data.displayName}
                {t(" · Demo profile")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "A product-specific suitability check is required before preparing an order.",
                )}
              </p>
            </div>
          </div>
        )}
      </Panel>
      <ProductCatalog />
    </div>
  );
}
