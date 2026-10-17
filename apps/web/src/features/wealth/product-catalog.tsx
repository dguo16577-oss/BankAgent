"use client";
import { useLocale } from "@/lib/i18n/locale";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProductFilters } from "@/lib/api/wealth";
import { formatMoney } from "@/lib/money";
import { useProducts } from "./use-wealth";
import {
  Panel,
  WealthError,
  productTypes,
  riskLevels,
  productHref,
  fieldClass,
} from "./wealth-ui";
export function ProductCatalog() {
  const { t } = useLocale();

  const [filters, setFilters] = useState<ProductFilters>({});
  const query = useProducts(filters);
  return (
    <Panel title={t("Discover products")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "Fictional products for exploring the investment flow. Display order is not a recommendation.",
        )}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 text-xs font-medium">
          {t("Product type")}
          <select
            aria-label={t("Product type")}
            className={fieldClass}
            value={filters.type ?? ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                type: (e.target.value || undefined) as ProductFilters["type"],
              })
            }
          >
            <option value="">{t("All types")}</option>
            {Object.entries(productTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs font-medium">
          {t("Risk level")}
          <select
            aria-label={t("Risk level")}
            className={fieldClass}
            value={filters.riskLevel ?? ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                riskLevel: (e.target.value ||
                  undefined) as ProductFilters["riskLevel"],
              })
            }
          >
            <option value="">{t("All risk levels")}</option>
            {riskLevels.map((r) => (
              <option key={r}>{t(r)}</option>
            ))}
          </select>
        </label>
        {(filters.type || filters.riskLevel) && (
          <Button variant="ghost" onClick={() => setFilters({})}>
            {t("Clear filters")}
          </Button>
        )}
      </div>
      {query.isPending ? (
        <p role="status">{t("Loading products…")}</p>
      ) : query.isError ? (
        <WealthError error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <p>{t("No products match these filters.")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {query.data.items.map((p) => (
            <Link
              key={p.id}
              href={productHref(p.id)}
              className="min-w-0 space-y-3 rounded-xl border p-5 transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t(productTypes[p.type])}
                </span>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                  {t(p.riskLevel)}
                </span>
              </div>
              <h3 className="font-semibold">{p.displayName}</h3>
              <p className="text-sm">
                {t("From", "minimum")}
                {t(formatMoney(p.minimumInvestment))}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(p.dataSource)} · {t(p.status)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
