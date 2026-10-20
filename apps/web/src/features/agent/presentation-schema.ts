import { z } from "zod";
import { getService } from "./service-catalog";

const amount = z.string().regex(/^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const bounded = z.string().max(160);
const dateRange = z.object({
  from: z.string().max(32),
  to: z.string().max(32),
});
const source = z.enum([
  "summarize_spending",
  "list_transactions",
  "compare_investment_products",
]);
const point = z.object({ label: bounded, amount });
const coverage = z.object({
  status: z.enum([
    "COMPLETE",
    "PARTIAL_CURRENT_PERIOD",
    "MISSING_PERIODS",
    "UNKNOWN_COVERAGE",
  ]),
  requested_start: z.string().max(32),
  requested_end: z.string().max(32),
  covered_start: z.string().max(32),
  covered_end: z.string().max(32),
  missing_periods: z.array(z.string().max(32)).max(24),
  as_of_time: z.string().max(32),
});
const chart = z.object({
  kind: z.enum(["BAR_CHART", "LINE_CHART", "PIE_CHART"]),
  title: bounded,
  currency,
  points: z.array(point).max(24),
  date_range: dateRange,
  incomplete: z.boolean(),
  coverage: coverage.optional(),
  source: z.literal("summarize_spending"),
});
const table = z.object({
  kind: z.literal("TABLE"),
  title: bounded,
  currency: currency.optional(),
  columns: z
    .array(
      z.object({ key: z.string().regex(/^[a-z_]{1,32}$/), label: bounded }),
    )
    .min(1)
    .max(8),
  rows: z.array(z.record(z.string(), bounded)).max(50),
  date_range: dateRange.optional(),
  incomplete: z.boolean(),
  coverage: coverage.optional(),
  source,
});
const serviceId = z
  .string()
  .refine((id) => Boolean(getService(id)), "Unknown service");

export const presentationBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TEXT"), text: z.string().max(6000) }),
  table,
  chart,
  z.object({
    kind: z.literal("SUMMARY_CARD"),
    title: bounded,
    amount,
    currency,
    date_range: dateRange,
    incomplete: z.boolean(),
    coverage: coverage.optional(),
    source: z.literal("summarize_spending"),
  }),
  z.object({ kind: z.literal("SERVICE_CARD"), service_id: serviceId }),
  z.object({
    kind: z.literal("AGENT_ASSISTANCE"),
    service_id: serviceId,
    accepted: z.boolean(),
  }),
  z.object({
    kind: z.literal("ACTION_REVIEW"),
    task_id: z.string().regex(/^[a-f0-9]{32}$/),
  }),
  z.object({
    kind: z.literal("TASK_PROGRESS"),
    status: bounded,
    steps: z.array(z.object({ id: bounded, status: bounded })).max(8),
  }),
]);

export type PresentationBlock = z.infer<typeof presentationBlockSchema>;

export function parsePresentation(value: unknown): PresentationBlock[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 32).flatMap((block) => {
    const parsed = presentationBlockSchema.safeParse(block);
    return parsed.success ? [parsed.data] : [];
  });
}
