"use client";
import { useLocale } from "@/lib/i18n/locale";

import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { components } from "@/generated/customer-api";
import { formatMoney } from "@/lib/money";
export function DailySpendingChart({
  trend,
}: {
  trend: components["schemas"]["SpendingTrendPoint"][];
}) {
  const { t, formatDate } = useLocale();

  if (!trend.length) return <p>{t("No trend available.")}</p>;
  // Numbers are used only for chart geometry. Labels retain API decimal strings.
  const points = trend.map((p) => ({
    day: formatDate(p.period.from),
    exact: formatMoney(p.amount),
    value: Number(p.amount.amount),
  }));
  return (
    <>
      <div
        className="h-56 min-w-0 overflow-hidden"
        role="group"
        aria-label={t("Daily spending trend")}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 700, height: 224 }}
        >
          <BarChart
            data={points}
            margin={{ top: 12, left: 0, right: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="#e1e7ed"
            />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10 }}
              minTickGap={48}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                const point = points.find(
                  (p) => p.day === payload?.[0]?.payload.day,
                );
                return active && point ? (
                  <div className="rounded-lg border bg-white p-3 text-sm">
                    {t(point.day)}: {t(point.exact)}
                  </div>
                ) : null;
              }}
            />
            <Bar
              dataKey="value"
              fill="#287d79"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary>{t("View daily amounts")}</summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((p) => (
            <li key={p.day}>
              {t(p.day)}: {t(p.exact)}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
