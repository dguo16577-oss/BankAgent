import type { components } from "@/generated/public-api";
import { provenance } from "./metadata";
export const rates = {
  ...provenance,
  asOf: "2026-09-27T09:00:00+08:00",
  source: "DEMO_RATE",
  disclaimer: "Illustrative demo rates, not live quotes.",
  items: [
    {
      ...provenance,
      id: "usd-cny",
      title: "USD / CNY",
      kind: "FX",
      value: "7.1000",
      unit: "CNY per USD",
      conditions: "Indicative mid-rate example; excludes fees and markup.",
    },
    ...(
      [
        ["jpy-cny", "JPY / CNY", "0.0480", "CNY per JPY"],
        ["eur-cny", "EUR / CNY", "8.2500", "CNY per EUR"],
        ["gbp-cny", "GBP / CNY", "9.5000", "CNY per GBP"],
        ["hkd-cny", "HKD / CNY", "0.9100", "CNY per HKD"],
        ["aud-cny", "AUD / CNY", "4.6500", "CNY per AUD"],
        ["sgd-cny", "SGD / CNY", "5.5400", "CNY per SGD"],
      ] as const
    ).map(([id, title, value, unit]) => ({
      ...provenance,
      id,
      title,
      kind: "FX" as const,
      value,
      unit,
      conditions: "Indicative mid-rate example; excludes fees and markup.",
    })),
    {
      ...provenance,
      id: "savings",
      title: "Flexible Savings",
      kind: "SAVINGS",
      value: "0.80",
      unit: "% per year",
      conditions:
        "Variable illustrative gross annual rate; no guaranteed return.",
    },
    {
      ...provenance,
      id: "deposit",
      title: "12-month Time Deposit",
      kind: "TIME_DEPOSIT",
      value: "1.50",
      unit: "% per year",
      conditions:
        "Illustrative gross annual rate for a 12-month CNY term; early withdrawal may reduce interest.",
    },
  ],
} satisfies components["schemas"]["PublicRates"];
