"use client";
import { useLocale } from "@/lib/i18n/locale";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import type { components } from "@/generated/customer-api";
import { formatMoney } from "@/lib/money";

export function SpendingChart({
  trend,
}: {
  trend: components["schemas"]["OverviewSpendingTrendPoint"][];
}) {
  const { t, locale } = useLocale();

  if (!trend.length)
    return (
      <p className="py-10 text-sm text-muted-foreground">
        {t("No spending history available.")}
      </p>
    );
  const points = trend.map((point) => ({
    label: new Intl.DateTimeFormat(locale, {
      month: "short",
      timeZone: "Asia/Shanghai",
    }).format(new Date(point.periodStart)),
    // Chart geometry only. Display labels and financial calculations retain exact strings.
    value: Number(point.amount.amount),
    exact: formatMoney(point.amount),
  }));
  return (
    <>
      <div
        className="h-44 min-w-0 overflow-hidden"
        role="group"
        aria-label={t("Six month spending trend")}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 420, height: 176 }}
        >
          <BarChart
            data={points}
            accessibilityLayer
            margin={{ top: 16, left: 0, right: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="#e1e7ed"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#617080" }}
            />
            <Tooltip
              cursor={{ fill: "#edf1f5" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = points.find(
                  (item) => item.label === payload[0].payload.label,
                );
                return point ? (
                  <div className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm">
                    {t(point.label)}: {t(point.exact)}
                  </div>
                ) : null;
              }}
            />
            <Bar
              dataKey="value"
              name={t("Spending")}
              fill="#287d79"
              radius={[5, 5, 0, 0]}
              maxBarSize={38}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          {t("View monthly amounts")}
        </summary>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {points.map((point) => (
            <li key={point.label}>
              {t(point.label)}: {t(point.exact)}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
