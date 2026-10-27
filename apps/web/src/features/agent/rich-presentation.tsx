"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getService } from "./service-catalog";
import { useLocale } from "@/lib/i18n/locale";
import {
  parsePresentation,
  type PresentationBlock,
} from "./presentation-schema";
import {
  categoryLabel,
  displayPeriod,
  presentationTitle,
} from "./financial-display";

const colors = [
  "#0f766e",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#be185d",
  "#475569",
];

function CoverageNote({
  value,
  range,
  source,
  incomplete = false,
}: {
  value?: {
    status: string;
    covered_start: string;
    covered_end: string;
    requested_start: string;
    requested_end: string;
    as_of_time: string;
    missing_periods: string[];
  };
  range?: { from: string; to: string };
  source?: string;
  incomplete?: boolean;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const statuses: Record<string, string> = zh
    ? {
        COMPLETE: "数据完整",
        PARTIAL_CURRENT_PERIOD: "统计期间进行中",
        MISSING_PERIODS: "存在缺失月份",
        UNKNOWN_COVERAGE: "覆盖范围待核实",
      }
    : {
        COMPLETE: "Complete coverage",
        PARTIAL_CURRENT_PERIOD: "Current period in progress",
        MISSING_PERIODS: "Missing periods",
        UNKNOWN_COVERAGE: "Coverage not verified",
      };
  if (!value && !range && !source) return null;
  const from = value?.covered_start || range?.from;
  const to = value?.covered_end || range?.to;
  return (
    <div
      className="mt-2 space-y-1 text-xs text-muted-foreground"
      data-testid="coverage-note"
    >
      {from && to && <p>{displayPeriod(from, to, zh)}</p>}
      {value && (
        <p>
          {statuses[value.status] ??
            (zh ? "覆盖范围待核实" : "Coverage not verified")}
        </p>
      )}
      {incomplete && (!value || value.status === "COMPLETE") && (
        <p>{zh ? "数据不完整" : "Incomplete data"}</p>
      )}
      {Boolean(value?.missing_periods.length) && (
        <p className="text-amber-800">
          {zh ? "缺失月份：" : "Missing periods: "}
          {value!.missing_periods.join(", ")}
        </p>
      )}
      <details className="pt-1">
        <summary className="cursor-pointer">
          {zh ? "数据来源与统计口径" : "Source and calculation details"}
        </summary>
        <dl className="mt-2 grid gap-1 break-words">
          {source && (
            <>
              <dt>{zh ? "接口标识" : "Source identifier"}</dt>
              <dd>{source}</dd>
            </>
          )}
          {value && (
            <>
              <dt>{zh ? "覆盖状态标识" : "Coverage identifier"}</dt>
              <dd>{value.status}</dd>
              <dt>
                {zh
                  ? "请求范围（起点含，终点不含）"
                  : "Requested range (start inclusive, end exclusive)"}
              </dt>
              <dd>
                {value.requested_start} – {value.requested_end}
              </dd>
              <dt>{zh ? "实际覆盖范围" : "Covered range"}</dt>
              <dd>
                {value.covered_start} – {value.covered_end}
              </dd>
              {value.as_of_time && (
                <>
                  <dt>{zh ? "数据时间" : "As of"}</dt>
                  <dd>{value.as_of_time}</dd>
                </>
              )}
            </>
          )}
        </dl>
        {source === "summarize_spending" && (
          <p className="mt-2">
            {zh
              ? "仅统计已完成的借记消费，不含普通转账和收入；各币种分别汇总。时间按北京时间，起点含、终点不含。"
              : "Completed debit spending only; ordinary transfers and income excluded. Currencies remain separate. UTC+08:00, start inclusive and end exclusive."}
          </p>
        )}
      </details>
    </div>
  );
}

function compareMoneyStrings(a: string, b: string) {
  if (!/^\d+\.\d{2}$/.test(a) || !/^\d+\.\d{2}$/.test(b))
    return a.localeCompare(b);
  const left = BigInt(a.replace(".", "")),
    right = BigInt(b.replace(".", ""));
  return left < right ? -1 : left > right ? 1 : 0;
}

function DataTable({
  block,
}: {
  block: Extract<PresentationBlock, { kind: "TABLE" }>;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState(block.columns[0].key);
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () =>
      block.rows
        .filter((row) =>
          Object.values(row).some((value) =>
            value.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
          ),
        )
        .sort((left, right) => {
          const a = left[sortKey] ?? "";
          const b = right[sortKey] ?? "";
          const comparison =
            sortKey === "amount"
              ? compareMoneyStrings(a, b)
              : a.localeCompare(b);
          return descending ? -comparison : comparison;
        }),
    [block.rows, filter, sortKey, descending],
  );
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        {zh ? "筛选" : "Filter"}{" "}
        <input
          aria-label={zh ? "筛选表格" : "Filter table"}
          className="ml-2 rounded border px-2 py-1"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(0);
          }}
        />
      </label>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {block.columns.map((column) => (
                <th key={column.key} scope="col" className="border-b p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDescending(
                        sortKey === column.key ? !descending : false,
                      );
                      setSortKey(column.key);
                    }}
                    aria-label={
                      zh ? `按${column.label}排序` : `Sort by ${column.label}`
                    }
                  >
                    {column.label}{" "}
                    {sortKey === column.key ? (descending ? "↓" : "↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 10, page * 10 + 10).map((row, index) => (
              <tr key={`${page}-${index}`}>
                {block.columns.map((column) => (
                  <td key={column.key} className="border-b p-2">
                    {row[column.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {zh ? "没有符合条件的数据。" : "No matching data."}
        </p>
      )}
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          {zh ? "上一页" : "Previous"}
        </button>
        <span>
          {page + 1} / {pages}
        </span>
        <button
          type="button"
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
        >
          {zh ? "下一页" : "Next"}
        </button>
      </div>
    </div>
  );
}

function ChartBlock({
  block,
  table,
}: {
  block: Extract<
    PresentationBlock,
    { kind: "BAR_CHART" | "LINE_CHART" | "PIE_CHART" }
  >;
  table?: Extract<PresentationBlock, { kind: "TABLE" }>;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const [showTable, setShowTable] = useState(false);
  const points = block.points.map((point) => ({
    ...point,
    displayLabel: block.title.startsWith("Spending by category")
      ? categoryLabel(point.label, zh)
      : point.label,
    value: Number(point.amount),
  }));
  const tooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: readonly {
      payload?: { displayLabel?: string; amount?: string };
    }[];
  }) =>
    active && payload?.[0]?.payload ? (
      <div className="rounded border bg-white p-2 text-sm">
        {payload[0].payload.displayLabel}: {payload[0].payload.amount}{" "}
        {block.currency}
      </div>
    ) : null;
  return (
    <section
      className="rounded-2xl border bg-white p-5 shadow-sm"
      aria-label={block.title}
    >
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold">
          {presentationTitle(block.title, zh)} · {block.currency}
        </h2>
        {table && (
          <button
            type="button"
            className="text-sm underline"
            onClick={() => setShowTable(!showTable)}
          >
            {showTable
              ? zh
                ? "查看图表"
                : "View chart"
              : zh
                ? "查看表格"
                : "View table"}
          </button>
        )}
      </div>
      <CoverageNote
        value={block.coverage}
        range={block.date_range}
        source={block.source}
        incomplete={block.incomplete}
      />
      {points.length === 0 ? (
        <p className="mt-4 text-sm">
          {zh ? "当前范围没有数据。" : "No data in this range."}
        </p>
      ) : showTable && table ? (
        <div className="mt-4">
          <DataTable block={table} />
        </div>
      ) : (
        <div
          className="mt-4 min-w-0"
          style={{
            height:
              block.kind === "BAR_CHART"
                ? Math.max(256, points.length * 36 + 48)
                : 256,
          }}
          role="img"
          aria-label={`${block.title} ${block.currency}`}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 700, height: 256 }}
          >
            {block.kind === "PIE_CHART" ? (
              <PieChart>
                <Pie
                  data={points}
                  dataKey="value"
                  nameKey="displayLabel"
                  outerRadius={80}
                  label
                >
                  {points.map((point, index) => (
                    <Cell
                      key={point.label}
                      fill={colors[index % colors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={tooltip} />
                <Legend />
              </PieChart>
            ) : block.kind === "LINE_CHART" ? (
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="displayLabel" />
                <YAxis />
                <Tooltip content={tooltip} />
                <Legend />
                <Line
                  name={block.currency}
                  dataKey="value"
                  stroke={colors[0]}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <BarChart
                data={points}
                layout="vertical"
                margin={{ left: 0, right: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="displayLabel"
                  width={112}
                  interval={0}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                />
                <Tooltip content={tooltip} />
                <Legend />
                <Bar
                  name={block.currency}
                  dataKey="value"
                  fill={colors[0]}
                  isAnimationActive={false}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function RichPresentation({
  raw,
  onAssist,
  onCancel,
  busy,
}: {
  raw: unknown;
  onAssist: (serviceId: string) => void;
  onCancel: (serviceId: string) => void;
  busy: boolean;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const blocks = parsePresentation(raw);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const tables = blocks.filter(
    (block): block is Extract<PresentationBlock, { kind: "TABLE" }> =>
      block.kind === "TABLE",
  );
  if (!blocks.length) return null;
  return (
    <div
      className="space-y-4"
      aria-label={zh ? "结构化银行结果" : "Structured bank results"}
    >
      {blocks.map((block, index) => {
        if (block.kind === "TEXT")
          return (
            <p key={index} className="whitespace-pre-wrap">
              {block.text}
            </p>
          );
        if (block.kind === "SUMMARY_CARD")
          return (
            <section
              key={index}
              className="rounded-2xl border bg-white p-5"
              aria-label={zh ? "消费总额" : "Total spending"}
            >
              <p>
                {presentationTitle(block.title, zh)} · {block.currency}
              </p>
              <strong className="text-2xl">{block.amount}</strong>
              <CoverageNote
                value={block.coverage}
                range={block.date_range}
                source={block.source}
                incomplete={block.incomplete}
              />
            </section>
          );
        if (block.kind === "TABLE") {
          if (
            tables.some(
              (table) =>
                table === block &&
                blocks.some(
                  (candidate) =>
                    ["BAR_CHART", "LINE_CHART", "PIE_CHART"].includes(
                      candidate.kind,
                    ) &&
                    "title" in candidate &&
                    candidate.title === block.title &&
                    "currency" in candidate &&
                    candidate.currency === block.currency,
                ),
            )
          )
            return null;
          return (
            <section
              key={index}
              className="rounded-2xl border bg-white p-5"
              aria-label={block.title}
            >
              <h2 className="font-semibold">
                {presentationTitle(block.title, zh)}
              </h2>
              <CoverageNote
                value={block.coverage}
                range={block.date_range}
                source={block.source}
                incomplete={block.incomplete}
              />
              <DataTable block={block} />
            </section>
          );
        }
        if (["BAR_CHART", "LINE_CHART", "PIE_CHART"].includes(block.kind)) {
          const chart = block as Extract<
            PresentationBlock,
            { kind: "BAR_CHART" | "LINE_CHART" | "PIE_CHART" }
          >;
          return (
            <ChartBlock
              key={index}
              block={chart}
              table={tables.find(
                (table) =>
                  table.title === chart.title &&
                  table.currency === chart.currency,
              )}
            />
          );
        }
        if (block.kind === "SERVICE_CARD") {
          const service = getService(block.service_id);
          return service ? (
            <section
              key={index}
              className="rounded-2xl border bg-white p-5"
              aria-label={zh ? "银行服务入口" : "Bank service"}
            >
              <h2 className="font-semibold">
                {zh ? service.title : service.titleEn}
              </h2>
              <p className="text-sm text-muted-foreground">
                {zh ? service.description : service.descriptionEn}
              </p>
              <Link className="mt-3 inline-block underline" href={service.href}>
                {zh ? "打开银行页面" : "Open bank page"}
              </Link>
            </section>
          ) : null;
        }
        if (block.kind === "AGENT_ASSISTANCE") {
          const service = getService(block.service_id);
          return service && !dismissed.includes(block.service_id) ? (
            <section
              key={index}
              className="rounded-2xl border bg-teal-50 p-5"
              aria-label={zh ? "Agent 协助" : "Agent assistance"}
            >
              <p>
                {zh
                  ? `需要 Aster 协助了解${service.title}吗？`
                  : `Would you like Aster to help with ${service.titleEn}?`}
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAssist(block.service_id)}
                >
                  {zh ? "接受协助" : "Accept assistance"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDismissed((old) => [...old, block.service_id]);
                    if (block.accepted) onCancel(block.service_id);
                  }}
                >
                  {zh ? "取消协助" : "Cancel assistance"}
                </button>
              </div>
              <p className="mt-2 text-xs">
                {zh
                  ? "接受协助只会继续对话；任何银行操作仍需单独复核与确认。"
                  : "Assistance continues the conversation. Every bank action needs separate review and confirmation."}
              </p>
            </section>
          ) : null;
        }
        if (block.kind === "TASK_PROGRESS")
          return (
            <section
              key={index}
              className="rounded-2xl border bg-white p-4 text-sm"
              aria-label={zh ? "目标进度" : "Goal progress"}
            >
              <strong>
                {zh ? "目标进度" : "Goal progress"} · {block.status}
              </strong>
              <ul>
                {block.steps.map((step) => (
                  <li key={step.id}>
                    {step.id}: {step.status}
                  </li>
                ))}
              </ul>
            </section>
          );
        // ACTION_REVIEW is deliberately rendered by the existing bank-backed PendingAction.
        return null;
      })}
    </div>
  );
}
