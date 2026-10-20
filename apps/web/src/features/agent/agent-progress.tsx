"use client";

import { useLocale } from "@/lib/i18n/locale";
import { z } from "zod";

export const taskStepLabels: Record<string, string> = {
  delegate_financial_analysis: "Delegate financial analysis",
  delegate_bank_knowledge: "Delegate policy research",
  list_accounts: "Query accounts",
  get_account: "View account details",
  list_cards: "Query cards",
  get_card: "View card details",
  get_card_controls: "View card controls",
  get_card_limits: "View card limits",
  list_card_products: "List card products",
  get_card_product: "View card product",
  compare_card_products: "Compare card products",
  list_card_applications: "List card applications",
  get_card_application: "View card application",
  list_credit_limit_applications: "List credit limit applications",
  get_credit_limit_application: "View credit limit application",
  prepare_card_action: "Prepare card action",
  prepare_card_application: "Prepare card application",
  prepare_credit_limit_application: "Prepare credit limit application",
  list_transactions: "Query transactions",
  summarize_spending: "Analyze spending",
  detect_transaction_anomalies: "Check unusual transactions",
  list_recipients: "List saved recipients",
  resolve_recipient: "Find recipient",
  get_transfer_intent: "View transfer intent",
  prepare_transfer: "Prepare transfer",
  list_scheduled_transfers: "List scheduled transfers",
  get_scheduled_transfer: "View scheduled transfer",
  prepare_scheduled_transfer: "Prepare scheduled transfer",
  prepare_cancel_scheduled_transfer: "Prepare schedule cancellation",
  calculate_split: "Calculate shares",
  list_split_requests: "List AA requests",
  get_split_request: "View AA request",
  prepare_split_request: "Prepare AA request",
  prepare_cancel_split_request: "Prepare AA cancellation",
  list_investment_products: "List investment products",
  get_investment_product: "View investment product",
  compare_investment_products: "Compare investment products",
  get_risk_profile: "View risk profile",
  check_investment_suitability: "Check suitability",
  list_holdings: "List holdings",
  get_holding: "View holding",
  prepare_investment_purchase: "Prepare investment purchase",
  prepare_investment_redemption: "Prepare investment redemption",
  search_bank_knowledge: "Search bank policies",
  list_recurring_payments: "Query recurring payments",
  get_recurring_payment: "View recurring payment",
  detect_recurring_payments: "Identify recurring charges",
  list_renewal_reminders: "Query renewal reminders",
  get_renewal_reminder: "View renewal reminder",
  list_in_app_notifications: "Query notifications",
  prepare_stop_recurring_payment: "Prepare mandate cancellation",
  prepare_renewal_reminder: "Prepare renewal reminder",
};

const additionalChinese: Record<string, string> = {
  delegate_financial_analysis: "委派财务分析",
  delegate_bank_knowledge: "委派银行知识检索",
  search_bank_knowledge: "检索银行政策与来源",
  list_recurring_payments: "查询定期扣款",
  get_recurring_payment: "查看定期扣款详情",
  detect_recurring_payments: "识别周期性扣款",
  list_renewal_reminders: "查询续费提醒",
  get_renewal_reminder: "查看续费提醒",
  list_in_app_notifications: "查询站内通知",
  prepare_stop_recurring_payment: "准备撤销代扣授权方案",
  prepare_renewal_reminder: "准备续费提醒方案",
};

export type ProgressStep = {
  id: string;
  tool: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
};
const delegationSchema = z
  .object({
    role: z.enum(["financial_analyst", "bank_knowledge"]),
    stepId: z.string().regex(/^g[1-8]$/),
    status: z.enum(["RUNNING", "SUCCEEDED", "FAILED", "PARTIAL", "CANCELLED"]),
  })
  .strict();
export type DelegationStep = z.infer<typeof delegationSchema>;
export function parseDelegation(value: unknown): DelegationStep | undefined {
  const result = delegationSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
export type ProgressPhase =
  | "CONNECTING"
  | "MODEL_STARTED"
  | "MODEL_FINISHED"
  | "MODEL_FAILED"
  | "TOOL_RUNNING"
  | "REVIEWING"
  | "FAILED";

export function AgentProgress({
  busy,
  phase,
  steps,
  taskStatus,
  delegations = [],
}: {
  busy: boolean;
  phase: ProgressPhase;
  steps: ProgressStep[];
  taskStatus?: unknown;
  delegations?: DelegationStep[];
}) {
  const { locale, t } = useLocale();
  const zh = locale === "zh-CN";
  if (
    !busy &&
    !steps.length &&
    !delegations.length &&
    phase !== "FAILED" &&
    phase !== "MODEL_FAILED"
  )
    return null;
  const hasFailure =
    phase === "FAILED" || phase === "MODEL_FAILED" || taskStatus === "FAILED";
  let title = zh ? "本轮处理已结束" : "This run has ended";
  if (hasFailure)
    title = zh
      ? "处理未完成，请查看错误后重试"
      : "Processing did not finish. Check the error before retrying.";
  else if (busy) {
    if (phase === "MODEL_STARTED")
      title = steps.length
        ? zh
          ? "正在结合查询结果判断下一步…"
          : "Reviewing results and deciding the next step…"
        : zh
          ? "正在理解需求并规划处理步骤…"
          : "Understanding your request and planning the next step…";
    else if (phase === "TOOL_RUNNING")
      title = zh
        ? "正在查询或准备银行方案…"
        : "Running a bank query or preparing a proposal…";
    else if (phase === "CONNECTING")
      title = zh ? "正在连接银行助手…" : "Connecting to the bank assistant…";
    else
      title = zh
        ? "正在核对结果与任务状态…"
        : "Checking results and task status…";
  } else if (
    taskStatus === "WAITING_CONFIRMATION" ||
    taskStatus === "WAITING_AUTH"
  ) {
    title = zh
      ? "方案已准备，等待你核对并验证；尚未执行"
      : "Proposal prepared. Review and verify it; no execution has occurred.";
  }
  return (
    <section
      aria-label="Agent execution progress"
      className="rounded-xl border bg-teal-50 p-4 text-sm"
    >
      <p role="status" aria-live="polite" className="font-medium">
        {busy ? "◌ " : ""}
        {title}
      </p>
      {delegations.length > 0 && (
        <section
          aria-label="Specialist collaboration"
          className="mt-3 space-y-2"
        >
          <p className="text-xs font-medium">
            {zh
              ? "协作任务（Supervisor 汇总）"
              : "Specialist tasks — Supervisor coordination"}
          </p>
          {delegations.map((item) => (
            <p
              key={`${item.role}-${item.stepId}`}
              className="rounded border bg-white/70 p-2 text-xs"
            >
              {item.role === "financial_analyst"
                ? zh
                  ? "金融分析助手"
                  : "Financial Analyst"
                : zh
                  ? "银行知识助手"
                  : "Bank Knowledge"}
              <span className="ml-2">
                {item.stepId} ·{" "}
                {item.status === "SUCCEEDED"
                  ? zh
                    ? "已返回结果"
                    : "Results returned"
                  : item.status === "RUNNING"
                    ? zh
                      ? "正在处理"
                      : "Working"
                    : item.status === "CANCELLED"
                      ? zh
                        ? "已取消"
                        : "Cancelled"
                      : item.status === "PARTIAL"
                        ? zh
                          ? "缺少信息或证据"
                          : "Information or evidence missing"
                        : zh
                          ? "处理失败"
                          : "Failed"}
              </span>
            </p>
          ))}
        </section>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {zh
          ? "以下为实际执行进度；资金或卡片操作仍需独立确认。"
          : "Actual execution progress. Financial and card actions still need separate confirmation."}
      </p>
      {steps.length > 0 && (
        <ol className="mt-3 space-y-2">
          {steps.map((step) => (
            <li key={step.id} className="flex gap-2">
              <span aria-hidden="true">
                {step.status === "SUCCEEDED"
                  ? "✓"
                  : step.status === "FAILED"
                    ? "!"
                    : busy
                      ? "◌"
                      : "—"}
              </span>
              <span>
                {zh && additionalChinese[step.tool]
                  ? additionalChinese[step.tool]
                  : taskStepLabels[step.tool]
                    ? t(taskStepLabels[step.tool])
                    : zh
                      ? "银行工具"
                      : "Banking tool"}
                <span className="ml-2 text-xs text-muted-foreground">
                  {step.status === "SUCCEEDED"
                    ? zh
                      ? "已返回结果"
                      : "Result received"
                    : step.status === "FAILED"
                      ? zh
                        ? "失败"
                        : "Failed"
                      : busy
                        ? zh
                          ? "处理中"
                          : "In progress"
                        : zh
                          ? "结果未确认"
                          : "Result unverified"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
