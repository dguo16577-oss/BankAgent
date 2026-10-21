"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  CopilotKitProvider,
  useAgent,
  type Message,
} from "@copilotkit/react-core/v2";
import { ActionVerification } from "@/features/security/action-verification";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale";
import {
  parseAgentMessage,
  type AgentMessage,
  type AgentTask,
} from "./agent-contract";
import { RichPresentation } from "./rich-presentation";
import { getService } from "./service-catalog";
import {
  AgentProgress,
  parseDelegation,
  type DelegationStep,
  type ProgressPhase,
  type ProgressStep,
} from "./agent-progress";

function confirmationPolicy(task: AgentTask) {
  const kind = task.confirmationKind;
  const actionType =
    task.confirmation && "actionType" in task.confirmation
      ? task.confirmation.actionType
      : undefined;
  const riskDirection =
    task.confirmation && "riskDirection" in task.confirmation
      ? task.confirmation.riskDirection
      : undefined;
  switch (kind) {
    case "CARD_ACTION":
      return {
        action: (actionType === "FREEZE"
          ? "CARD_FREEZE"
          : actionType === "UNFREEZE"
            ? "CARD_UNFREEZE"
            : riskDirection === "RISK_INCREASING"
              ? "CARD_CONTROL_RISK_INCREASING"
              : "CARD_CONTROL_PROTECTIVE") as
          | "CARD_FREEZE"
          | "CARD_UNFREEZE"
          | "CARD_CONTROL_RISK_INCREASING"
          | "CARD_CONTROL_PROTECTIVE",
        resourceType: "CARD_ACTION_INTENT" as const,
      };
    case "CARD_APPLICATION":
      return {
        action: "CARD_APPLICATION_SUBMIT" as const,
        resourceType: "APPLICATION_INTENT" as const,
      };
    case "CREDIT_LIMIT_APPLICATION":
      return {
        action: "CREDIT_LIMIT_APPLICATION_SUBMIT" as const,
        resourceType: "CREDIT_LIMIT_INTENT" as const,
      };
    case "RECURRING_STOP":
      return {
        action: "RECURRING_STOP_FUTURE_PAYMENTS" as const,
        resourceType: "RECURRING_PAYMENT_INTENT" as const,
      };
    case "SCHEDULE":
      return {
        action: (actionType === "CANCEL"
          ? "SCHEDULED_PAYMENT_CANCEL"
          : "SCHEDULED_PAYMENT_CREATE") as
          "SCHEDULED_PAYMENT_CANCEL" | "SCHEDULED_PAYMENT_CREATE",
        resourceType: "SCHEDULE_ACTION_INTENT" as const,
      };
    case "SPLIT":
      return {
        action: (actionType === "CANCEL"
          ? "SPLIT_REQUEST_CANCEL"
          : "SPLIT_REQUEST_CREATE") as
          "SPLIT_REQUEST_CANCEL" | "SPLIT_REQUEST_CREATE",
        resourceType: "SPLIT_ACTION_INTENT" as const,
      };
    case "INVESTMENT_PURCHASE":
    case "INVESTMENT_REDEMPTION":
      return {
        action: "INVESTMENT_ORDER_EXECUTE" as const,
        resourceType: "INVESTMENT_ORDER_INTENT" as const,
      };
    case "TRANSFER":
      return {
        action: "TRANSFER_EXECUTE" as const,
        resourceType: "TRANSFER_INTENT" as const,
      };
    default:
      return undefined;
  }
}

function trustedTerms(task: AgentTask) {
  const intent = task.confirmation as unknown as
    Record<string, unknown> | undefined;
  if (!intent) return [];
  const text = (value: unknown) =>
    typeof value === "string" && value.length <= 120
      ? value.replace(/\b\d{12,19}\b/g, "[masked]")
      : undefined;
  const object = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  const amount = object(intent.amount);
  const fees = object(intent.fees);
  const totalDebit = object(intent.totalDebit);
  const estimatedProceeds = object(intent.estimatedProceeds);
  const recipient = object(intent.recipient);
  const product = object(intent.product);
  const card = object(intent.card);
  const sourceAccount = object(intent.sourceAccount);
  const destinationAccount = object(intent.destinationAccount);
  const recurringPayment = object(intent.recurringPayment);
  const before = object(intent.before);
  const after = object(intent.after);
  const money = (value: Record<string, unknown> | undefined) =>
    value && text(value.amount) && text(value.currency)
      ? `${text(value.amount)} ${text(value.currency)}`
      : undefined;
  const account = (value: Record<string, unknown> | undefined) =>
    value
      ? [text(value.displayName), text(value.maskedAccountNumber)]
          .filter(Boolean)
          .join(" · ")
      : undefined;
  const values: [string, string | undefined][] = [
    ["Amount", money(amount)],
    [
      "Recipient",
      recipient && (text(recipient.displayName) ?? text(recipient.name)),
    ],
    ["Product", product && (text(product.name) ?? text(product.displayName))],
    ["Risk level", product && text(product.riskLevel)],
    [
      "Card",
      card &&
        (text(card.maskedNumber) ??
          text(card.maskedPan) ??
          text(card.lastFour)),
    ],
    ["Source account", account(sourceAccount)],
    ["Destination account", account(destinationAccount)],
    ["Fees", money(fees)],
    ["Total debit", money(totalDebit)],
    ["Estimated proceeds", money(estimatedProceeds)],
    ["Bank mandate", recurringPayment && text(recurringPayment.displayName)],
    ["Reminder time", text(intent.dueAt)],
    ["Reminder time zone", text(intent.timeZone)],
    ["Date basis", text(intent.dateBasis)],
    ["Reminder target", text(intent.targetType)],
    ["Previous status", before && text(before.status)],
    ["After confirmation", after && text(after.status)],
    ["Action", text(intent.actionType)],
  ];
  return values.filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

const reviewLabelsZh: Record<string, string> = {
  Amount: "金额",
  Recipient: "收款人",
  Product: "产品",
  "Risk level": "风险等级",
  Card: "银行卡",
  "Source account": "付款账户",
  "Destination account": "到账账户",
  Fees: "费用",
  "Total debit": "扣款合计",
  "Estimated proceeds": "预计到账",
  "Bank mandate": "银行代扣",
  "Reminder time": "提醒时间",
  "Reminder time zone": "时区",
  "Date basis": "日期依据",
  "Reminder target": "提醒对象",
  "Previous status": "原状态",
  "After confirmation": "确认后状态",
  Action: "操作类型",
};

export function PendingAction({
  state,
  onResolved,
}: {
  state: Record<string, unknown> | undefined;
  onResolved: (result: AgentMessage) => void;
}) {
  const { locale } = useLocale();
  const taskId = typeof state?.taskId === "string" ? state.taskId : undefined;
  const status = state?.status;
  const [task, setTask] = useState<AgentTask>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (
      !taskId ||
      (status !== "WAITING_CONFIRMATION" && status !== "WAITING_AUTH")
    )
      return;
    let cancelled = false;
    let inFlight = false;
    let attempts = 0;
    let settled = false;
    const refresh = async () => {
      if (cancelled || settled || inFlight || attempts >= 60) return;
      inFlight = true;
      attempts++;
      try {
        const response = await fetch(`/api/agent/tasks/${taskId}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error("Task review unavailable");
        const result = parseAgentMessage(await response.json());
        if (cancelled || result.task?.taskId !== taskId) return;
        setTask(result.task);
        if (
          !["WAITING_CONFIRMATION", "WAITING_AUTH", "RUNNING"].includes(
            result.task.status,
          )
        ) {
          settled = true;
          setError(undefined);
          onResolved(result);
        }
      } catch {
        if (!cancelled && attempts === 1)
          setError("Could not load bank review");
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    // Another tab may finish verification first. Only read the owned task;
    // never repeat its verification, confirmation or bank execution here.
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [taskId, status, onResolved]);

  async function act(action: "CONFIRM" | "CANCEL", authorizationId?: string) {
    if (!task?.confirmation || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          taskId: task.taskId,
          locale,
          ...(action === "CONFIRM"
            ? {
                intentId: task.confirmation.id,
                intentHash: task.confirmation.intentHash,
                ...(authorizationId
                  ? { actionAuthorizationId: authorizationId }
                  : {}),
              }
            : {}),
        }),
      });
      if (!response.ok) throw new Error("Bank action failed");
      const result: AgentMessage = parseAgentMessage(await response.json());
      setTask(result.task);
      if (
        result.task &&
        result.task.status !== "WAITING_CONFIRMATION" &&
        result.task.status !== "WAITING_AUTH"
      )
        onResolved(result);
      if (result.task?.errorCode) setError(result.task.errorCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bank action failed");
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  if (
    !task ||
    task.taskId !== taskId ||
    !task.confirmation ||
    (task.status !== "WAITING_CONFIRMATION" && task.status !== "WAITING_AUTH")
  ) {
    return error ? (
      <p role="alert" className="text-destructive">
        {error}
      </p>
    ) : null;
  }
  const policy = confirmationPolicy(task);
  const reconciliationRequired = task.errorCode === "EXECUTION_OUTCOME_UNKNOWN";
  return (
    <section
      className="rounded-2xl border border-amber-300 bg-amber-50 p-5"
      aria-label="Bank action review"
    >
      <h2 className="text-lg font-semibold">
        {reconciliationRequired
          ? locale === "zh-CN"
            ? "银行执行结果待核实"
            : "Bank execution requires reconciliation"
          : locale === "zh-CN"
            ? "银行操作待确认"
            : "Bank action awaiting confirmation"}
      </h2>
      <p className="mt-2 text-sm">
        {reconciliationRequired
          ? locale === "zh-CN"
            ? "银行可能已完成此操作。请核对银行交易记录；此处不会重新发起验证或取消意图。"
            : "The bank may already have completed this action. Check your bank records; this page will not start new verification or cancel the intent."
          : locale === "zh-CN"
            ? "请核对意图条款；只有通过下方银行验证后才会执行。"
            : "Review the prepared terms. The bank acts only after your verification below."}
      </p>
      <dl className="mt-3 text-sm">
        <dt>{locale === "zh-CN" ? "操作" : "Action"}</dt>
        <dd className="font-medium">{task.confirmationKind}</dd>
        {trustedTerms(task).map(([label, value]) => (
          <div key={label} className="mt-2">
            <dt className="text-muted-foreground">
              {locale === "zh-CN" ? (reviewLabelsZh[label] ?? label) : label}
            </dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
        <dt>{locale === "zh-CN" ? "到期时间" : "Expires"}</dt>
        <dd>{task.confirmation.expiresAt}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-3">
        {reconciliationRequired ? null : policy ? (
          <ActionVerification
            key={task.confirmation.id}
            action={policy.action}
            resourceType={policy.resourceType}
            resourceId={task.confirmation.id}
            resourceHash={task.confirmation.intentHash}
            label={locale === "zh-CN" ? "核对并确认" : "Verify and confirm"}
            disabled={busy}
            onVerified={(authorizationId) => act("CONFIRM", authorizationId)}
          />
        ) : task.confirmationKind === "RENEWAL_REMINDER" ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void act("CONFIRM")}
          >
            {locale === "zh-CN" ? "确认提醒操作" : "Confirm reminder"}
          </Button>
        ) : (
          <p>
            {locale === "zh-CN"
              ? "此操作请在原版助手确认。"
              : "Confirm this action in the original assistant."}
          </p>
        )}
        {!reconciliationRequired && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void act("CANCEL")}
          >
            {locale === "zh-CN" ? "取消意图" : "Cancel intent"}
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function SpendingCard({
  state,
}: {
  state: Record<string, unknown> | undefined;
}) {
  const { locale } = useLocale();
  const cards = Array.isArray(state?.resultCards) ? state.resultCards : [];
  const card = cards.find(
    (value: unknown) =>
      value &&
      typeof value === "object" &&
      "kind" in value &&
      value.kind === "SPENDING_ANALYSIS",
  ) as Record<string, unknown> | undefined;
  if (!card) return null;
  const validRows = (raw: unknown, label?: "category" | "period") =>
    (Array.isArray(raw) ? raw : []).filter(
      (item): item is Record<string, string> =>
        item &&
        typeof item === "object" &&
        typeof item.amount === "string" &&
        /^\d{1,12}(?:\.\d{1,2})?$/.test(item.amount) &&
        typeof item.currency === "string" &&
        /^[A-Z]{3}$/.test(item.currency) &&
        (!label || typeof item[label] === "string"),
    ) as Record<string, string>[];
  const totals = validRows(card.totals);
  const categories = validRows(card.categories, "category");
  const buckets = validRows(card.buckets, "period");
  const max = Math.max(1, ...categories.map((row) => Number(row.amount)));
  return (
    <section
      className="rounded-2xl border bg-white p-5 shadow-sm"
      aria-label="Spending analysis"
    >
      <h2 className="text-lg font-semibold">
        {locale === "zh-CN" ? "消费分析" : "Spending analysis"}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {locale === "zh-CN"
          ? "按币种分别统计 · 银行交易数据"
          : "By currency · bank transaction data"}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {totals.map((row, index) => (
          <div key={index} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span className="block text-xs text-muted-foreground">
              {row.currency}
            </span>
            <strong className="text-lg">{row.amount}</strong>
          </div>
        ))}
      </div>
      {categories.length > 0 && (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold">
            {locale === "zh-CN" ? "分类" : "Categories"}
          </h3>
          {categories.map((row, index) => (
            <div key={index} className="text-xs">
              <div className="flex justify-between gap-3">
                <span>{row.category}</span>
                <span>
                  {row.amount} {row.currency}
                </span>
              </div>
              <div className="mt-1 h-2 rounded bg-slate-100">
                <div
                  className="h-2 rounded bg-teal-600"
                  style={{
                    width: `${Math.max(2, (Number(row.amount) / max) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {buckets.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">
            {locale === "zh-CN" ? "趋势" : "Trend"}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {buckets.map((row, index) => (
              <span key={index} className="rounded-lg bg-teal-50 px-3 py-2">
                {row.period}: {row.amount} {row.currency}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function TaskProgressCard({
  state,
  bankResult,
}: {
  state: Record<string, unknown> | undefined;
  bankResult: AgentMessage | undefined;
}) {
  const { locale } = useLocale();
  const [reconciled, setReconciled] = useState<AgentMessage>();
  const taskId = bankResult?.task?.taskId ?? state?.taskId;
  const completedCount =
    bankResult?.task?.completedActionCount ?? state?.completedActionCount;
  useEffect(() => {
    if (
      bankResult?.task?.receipt ||
      typeof taskId !== "string" ||
      !/^[a-f0-9]{32}$/.test(taskId) ||
      typeof completedCount !== "number" ||
      completedCount < 1
    )
      return;
    let cancelled = false;
    void fetch(`/api/agent/tasks/${taskId}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = parseAgentMessage(await response.json());
        if (!cancelled && result.task?.taskId === taskId) setReconciled(result);
      })
      .catch(() => {
        /* Do not invent a receipt when the owned read fails. */
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, completedCount, bankResult?.task?.receipt]);
  const receiptTask = bankResult?.task?.receipt
    ? bankResult.task
    : reconciled?.task?.taskId === taskId
      ? reconciled?.task
      : undefined;
  const status = bankResult?.task?.status ?? state?.status;
  const completed =
    bankResult?.task?.completedActionCount ?? state?.completedActionCount;
  const failed =
    bankResult?.task?.failedActionCount ?? state?.failedActionCount;
  const receiptId =
    receiptTask?.receiptKind &&
    typeof receiptTask.receipt?.id === "string" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(receiptTask.receipt.id)
      ? receiptTask.receipt.id
      : undefined;
  if (
    !bankResult &&
    !["FAILED", "CANCELLED"].includes(String(status)) &&
    (!Number.isInteger(completed) || Number(completed) < 1) &&
    (!Number.isInteger(failed) || Number(failed) < 1)
  )
    return null;
  const statusLabel =
    status === "SUCCEEDED"
      ? locale === "zh-CN"
        ? "已完成"
        : "Completed"
      : status === "CANCELLED"
        ? locale === "zh-CN"
          ? "已取消"
          : "Cancelled"
        : status === "FAILED"
          ? locale === "zh-CN"
            ? "未完成"
            : "Failed"
          : status === "PARTIAL"
            ? locale === "zh-CN"
              ? "部分完成"
              : "Partially completed"
            : status === "BLOCKED_PROVIDER"
              ? locale === "zh-CN"
                ? "已暂停"
                : "Paused"
              : locale === "zh-CN"
                ? "进行中"
                : "In progress";
  return (
    <section
      className="rounded-2xl border bg-white p-4 text-sm"
      role="status"
      aria-label="Task progress"
    >
      <strong>{locale === "zh-CN" ? "任务进度" : "Task progress"}</strong>
      <p className="mt-1">{statusLabel}</p>
      {receiptId && (
        <dl className="mt-2 break-all">
          <dt>{locale === "zh-CN" ? "银行回执" : "Bank receipt"}</dt>
          <dd>{receiptId}</dd>
        </dl>
      )}
      {Number.isInteger(completed) && Number(completed) > 0 && (
        <p>
          {locale === "zh-CN" ? "已完成银行操作" : "Completed bank actions"}:{" "}
          {String(completed)}
        </p>
      )}
      {Number.isInteger(failed) && Number(failed) > 0 && (
        <p>
          {locale === "zh-CN" ? "失败的银行操作" : "Failed bank actions"}:{" "}
          {String(failed)}
        </p>
      )}
    </section>
  );
}

function KnowledgeSources({
  state,
}: {
  state: Record<string, unknown> | undefined;
}) {
  const { locale } = useLocale();
  const cards = Array.isArray(state?.resultCards) ? state.resultCards : [];
  const card = cards.find(
    (value: unknown) =>
      value &&
      typeof value === "object" &&
      "kind" in value &&
      (value.kind === "KNOWLEDGE_SOURCES" ||
        value.kind === "KNOWLEDGE_NO_RESULT"),
  ) as Record<string, unknown> | undefined;
  if (!card) return null;
  const sources = Array.isArray(card.sources) ? card.sources : [];
  return (
    <section
      className="rounded-2xl border bg-white p-5 shadow-sm"
      aria-label="Knowledge sources"
    >
      <h2 className="text-lg font-semibold">
        {locale === "zh-CN" ? "知识来源" : "Knowledge sources"}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {locale === "zh-CN"
          ? "Aster 演示政策 · 产品说明，与实时银行状态分开"
          : "Aster Demo Policy · separate from live bank state"}
      </p>
      {sources.length === 0 && (
        <p className="mt-3 text-sm">
          {locale === "zh-CN"
            ? "没有找到可核实的适用文档。"
            : "No verifiable applicable document was found."}
        </p>
      )}
      <div className="mt-3 space-y-2">
        {sources.map((value: unknown) => {
          if (!value || typeof value !== "object") return null;
          const source = value as Record<string, unknown>;
          const title = typeof source.title === "string" ? source.title : "";
          const version =
            typeof source.version === "string" ? source.version : "";
          const location =
            typeof source.location === "string" ? source.location : "";
          const excerpt =
            typeof source.excerpt === "string" ? source.excerpt : "";
          const id =
            typeof source.evidenceId === "string" ? source.evidenceId : "";
          const historical = source.status === "HISTORICAL";
          return (
            <details key={id} className="rounded-xl border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {title} · {version} · {location}
                {historical && (
                  <span className="ml-2 text-amber-700">
                    {locale === "zh-CN" ? "历史版本" : "Historical"}
                  </span>
                )}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                {excerpt}
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {id}
              </p>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function AgentConversation({ threadId }: { threadId: string }) {
  const { agent, isReady } = useAgent({
    agentId: "aster-conversation",
    runtimeAgentId: "aster",
    threadId,
  });
  const { locale } = useLocale();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [bankResult, setBankResult] = useState<AgentMessage>();
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [phase, setPhase] = useState<ProgressPhase>("CONNECTING");
  const [delegations, setDelegations] = useState<DelegationStep[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [recoveredMessages, setRecoveredMessages] = useState<Message[]>([]);
  const state = agent.state as Record<string, unknown> | undefined;
  const [recoveredState, setRecoveredState] =
    useState<Record<string, unknown>>();
  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    void fetch(`/api/copilotkit/threads/${threadId}/messages`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Transcript unavailable")),
      )
      .then((value: unknown) => {
        if (cancelled) return;
        if (
          value &&
          typeof value === "object" &&
          "messages" in value &&
          Array.isArray(value.messages)
        ) {
          const messages = value.messages.filter(
            (item: unknown) =>
              item &&
              typeof item === "object" &&
              "id" in item &&
              typeof item.id === "string" &&
              "role" in item &&
              (item.role === "user" ||
                item.role === "assistant" ||
                item.role === "tool"),
          ) as Message[];
          if (messages.length) setRecoveredMessages(messages);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Transcript unavailable");
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [agent, isReady, threadId]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    let inFlight = false;
    let attempts = 0;
    const recoveryKey = `aster-agui-inflight-${threadId}`;
    const recover = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const response = await fetch("/api/copilotkit/thread-state", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const value: unknown = response.ok ? await response.json() : undefined;
        const task =
          value && typeof value === "object" && "task" in value
            ? value.task
            : undefined;
        const rawMarker = sessionStorage.getItem(recoveryKey);
        const marker = rawMarker
          ? (JSON.parse(rawMarker) as {
              taskId?: string;
              status?: string;
              assistantCount?: number;
            })
          : undefined;
        let newerTranscript = false;
        let assistantCount = 0;
        if (marker) {
          const messagesResponse = await fetch(
            `/api/copilotkit/threads/${threadId}/messages`,
            { credentials: "same-origin", cache: "no-store" },
          );
          const transcript: unknown = messagesResponse.ok
            ? await messagesResponse.json()
            : undefined;
          const messages =
            transcript &&
            typeof transcript === "object" &&
            "messages" in transcript &&
            Array.isArray(transcript.messages)
              ? (transcript.messages as Message[])
              : [];
          assistantCount = messages.filter(
            (message) => message.role === "assistant",
          ).length;
          newerTranscript = assistantCount > (marker.assistantCount ?? 0);
          if (newerTranscript && !cancelled) setRecoveredMessages(messages);
        }
        if (
          !cancelled &&
          task &&
          typeof task === "object" &&
          "taskId" in task &&
          "status" in task &&
          typeof task.taskId === "string" &&
          typeof task.status === "string" &&
          (newerTranscript ||
            [
              "WAITING_USER",
              "WAITING_CONFIRMATION",
              "WAITING_AUTH",
              "SUCCEEDED",
              "FAILED",
              "CANCELLED",
              "PARTIAL",
              "BLOCKED_PROVIDER",
            ].includes(task.status)) &&
          (!marker ||
            task.taskId !== marker.taskId ||
            task.status !== marker.status ||
            newerTranscript)
        ) {
          if (
            marker &&
            !newerTranscript &&
            task.status === "SUCCEEDED" &&
            "lastAssistantMessage" in task &&
            typeof task.lastAssistantMessage === "string" &&
            task.lastAssistantMessage.length > 0 &&
            assistantCount <= (marker.assistantCount ?? 0)
          ) {
            const messages: Message[] = [];
            if (
              "lastUserMessage" in task &&
              typeof task.lastUserMessage === "string" &&
              task.lastUserMessage.length > 0
            ) {
              messages.push({
                id: `${task.taskId}-recovered-user`,
                role: "user",
                content: task.lastUserMessage,
              });
            }
            messages.push({
              id: `${task.taskId}-recovered-assistant`,
              role: "assistant",
              content: task.lastAssistantMessage,
            });
            setRecoveredMessages(messages);
          }
          setRecoveredState({
            taskId: task.taskId,
            status: task.status,
            resultCards:
              "resultCards" in task && Array.isArray(task.resultCards)
                ? task.resultCards
                : [],
            presentation:
              "presentation" in task && Array.isArray(task.presentation)
                ? task.presentation
                : [],
          });
          sessionStorage.removeItem(recoveryKey);
        } else if (newerTranscript) {
          sessionStorage.removeItem(recoveryKey);
        }
      } catch {
        // A disconnect may outlive this fetch; the next bounded poll retries.
      } finally {
        inFlight = false;
      }
    };
    void recover();
    const timer = window.setInterval(() => {
      if (!sessionStorage.getItem(recoveryKey)) {
        window.clearInterval(timer);
        return;
      }
      attempts++;
      if (attempts > 60) {
        window.clearInterval(timer);
        sessionStorage.removeItem(recoveryKey);
        if (!cancelled) setError("Could not recover the interrupted task");
        return;
      }
      void recover();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hydrated, threadId]);

  async function send(message: string) {
    if (!isReady || !hydrated || busy || !message || message.length > 2000)
      return;
    setBusy(true);
    setRecoveredState(undefined);
    setError(undefined);
    setBankResult(undefined);
    setSteps([]);
    setDelegations([]);
    setPhase("CONNECTING");
    setDraft("");
    const previousTask =
      typeof state?.taskId === "string" ? state : recoveredState;
    sessionStorage.setItem(
      `aster-agui-inflight-${threadId}`,
      JSON.stringify({
        taskId: previousTask?.taskId,
        status: previousTask?.status,
        assistantCount: [...recoveredMessages, ...agent.messages].filter(
          (item) => item.role === "assistant",
        ).length,
      }),
    );
    agent.setMessages([
      ...agent.messages,
      { id: crypto.randomUUID(), role: "user", content: message },
    ]);
    try {
      const runResult = await agent.runAgent(
        {},
        {
          onCustomEvent: ({ event }) => {
            if (event.name === "aster.delegation") {
              const item = parseDelegation(event.value);
              if (item)
                setDelegations((old) => [
                  ...old.filter(
                    (previous) =>
                      previous.role !== item.role ||
                      previous.stepId !== item.stepId,
                  ),
                  item,
                ]);
              return;
            }
            if (
              event.name !== "aster.progress" ||
              !event.value ||
              typeof event.value !== "object"
            )
              return;
            const phase = (event.value as Record<string, unknown>).phase;
            if (
              phase === "MODEL_STARTED" ||
              phase === "MODEL_FINISHED" ||
              phase === "MODEL_FAILED"
            )
              setPhase(phase);
          },
          onToolCallStartEvent: ({ event }) => {
            setPhase("TOOL_RUNNING");
            setSteps((old) => [
              ...old,
              {
                id: event.toolCallId,
                tool: event.toolCallName,
                status: "RUNNING",
              },
            ]);
          },
          onToolCallResultEvent: ({ event }) => {
            setPhase("REVIEWING");
            setSteps((old) =>
              old.map((item) =>
                item.id === event.toolCallId
                  ? {
                      ...item,
                      status:
                        event.content === "Failed" ? "FAILED" : "SUCCEEDED",
                    }
                  : item,
              ),
            );
          },
        },
      );
      if (!runResult?.newMessages?.length) {
        setPhase("FAILED");
        setError("The assistant did not start. Please retry.");
      } else sessionStorage.removeItem(`aster-agui-inflight-${threadId}`);
    } catch (cause) {
      setPhase("FAILED");
      setError(cause instanceof Error ? cause.message : "Agent unavailable");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft.trim());
  }

  const displayState =
    typeof state?.taskId === "string" ? state : recoveredState;
  const presentation = displayState?.presentation;

  return (
    <div className="space-y-5">
      <PendingAction
        state={
          typeof state?.taskId === "string"
            ? state
            : (recoveredState ??
              (bankResult?.task as unknown as
                Record<string, unknown> | undefined))
        }
        onResolved={(result) => {
          agent.setState({});
          setRecoveredState(undefined);
          setBankResult(result);
        }}
      />
      <TaskProgressCard state={displayState} bankResult={bankResult} />
      <RichPresentation
        raw={presentation}
        busy={busy}
        onCancel={() => {
          const taskId = displayState?.taskId;
          if (
            typeof taskId !== "string" ||
            displayState?.status === "SUCCEEDED"
          )
            return;
          setBusy(true);
          void fetch("/api/agent/chat", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "CANCEL", taskId, locale }),
          })
            .then(async (response) => {
              if (!response.ok) throw new Error("Could not cancel assistance");
              const result = parseAgentMessage(await response.json());
              setBankResult(result);
              setRecoveredState(undefined);
              agent.setState({});
            })
            .catch((cause) =>
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not cancel assistance",
              ),
            )
            .finally(() => setBusy(false));
        }}
        onAssist={(serviceId) => {
          const service = getService(serviceId);
          if (service)
            void send(
              locale === "zh-CN"
                ? `请协助我了解${service.title}服务。先说明需要补充的信息；本次点击不授权创建或执行任何银行操作。`
                : `Help me understand the ${service.titleEn} service. Ask for missing details first. This click does not authorize preparing or executing a bank action.`,
            );
        }}
      />
      {!Array.isArray(presentation) && <SpendingCard state={displayState} />}
      <KnowledgeSources
        state={typeof state?.taskId === "string" ? state : recoveredState}
      />
      <div className="min-h-[34rem] rounded-2xl border bg-white p-5 shadow-sm">
        <div className="space-y-4" aria-live="polite">
          {[...recoveredMessages, ...agent.messages]
            .filter(
              (message) =>
                message.role === "user" || message.role === "assistant",
            )
            .map((message) => (
              <article
                key={message.id}
                className={`max-w-[90%] rounded-2xl p-4 text-sm leading-7 ${message.role === "user" ? "ml-auto bg-slate-900 text-white" : "border bg-slate-50"}`}
              >
                <p className="mb-1 text-xs font-semibold">
                  {message.role === "user"
                    ? locale === "zh-CN"
                      ? "你"
                      : "You"
                    : "Aster"}
                </p>
                <p className="whitespace-pre-wrap">
                  {typeof message.content === "string" ? message.content : ""}
                </p>
              </article>
            ))}
          {bankResult?.reply && (
            <article
              className="max-w-[90%] rounded-2xl border bg-teal-50 p-4 text-sm leading-7"
              aria-label={
                locale === "zh-CN" ? "银行任务结果" : "Bank task result"
              }
            >
              <p className="mb-1 text-xs font-semibold">Aster</p>
              <p className="whitespace-pre-wrap">{bankResult.reply}</p>
            </article>
          )}
          <AgentProgress
            busy={busy}
            phase={phase}
            steps={steps}
            taskStatus={displayState?.status}
            delegations={
              delegations.length
                ? delegations
                : Array.isArray(displayState?.delegations)
                  ? displayState.delegations
                      .map(parseDelegation)
                      .filter((item): item is DelegationStep => !!item)
                  : []
            }
          />
        </div>
        <form onSubmit={submit} className="mt-6 flex gap-3 border-t pt-5">
          <label className="sr-only" htmlFor="aster-copilot-message">
            {locale === "zh-CN" ? "你的消息" : "Your message"}
          </label>
          <input
            id="aster-copilot-message"
            className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            placeholder={
              locale === "zh-CN"
                ? "咨询账户、消费，或提出转账需求…"
                : "Ask about accounts, spending, or a transfer…"
            }
          />
          <Button
            type="submit"
            disabled={!isReady || !hydrated || busy || !draft.trim()}
          >
            {busy ? "…" : locale === "zh-CN" ? "发送" : "Send"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function CopilotWorkspace() {
  const { locale } = useLocale();
  const [threadId, setThreadId] = useState<string>();
  const [threadError, setThreadError] = useState(false);
  useEffect(() => {
    void fetch("/api/copilotkit/thread", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Session unavailable")),
      )
      .then((value: unknown) => {
        if (
          value &&
          typeof value === "object" &&
          "threadId" in value &&
          typeof value.threadId === "string"
        )
          setThreadId(value.threadId);
        else setThreadError(true);
      })
      .catch(() => setThreadError(true));
  }, []);
  if (threadError)
    return (
      <p role="alert">
        {locale === "zh-CN"
          ? "银行会话无法验证，请重新登录。"
          : "Bank session unavailable. Please sign in again."}
      </p>
    );
  if (!threadId)
    return (
      <p role="status">
        {locale === "zh-CN" ? "正在验证银行会话…" : "Checking bank session…"}
      </p>
    );
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      agentId="aster"
      enableInspector={false}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-teal-800">Aster · AG-UI</p>
            <h1 className="text-3xl font-semibold">
              {locale === "zh-CN" ? "智能银行助手" : "Aster banking assistant"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {locale === "zh-CN"
                ? "实验版对话界面。银行操作仍由独立确认流程执行。"
                : "Experimental conversation. Bank actions still require separate confirmation."}
            </p>
          </div>
          <Link className="text-sm underline" href="/app/agent">
            {locale === "zh-CN" ? "返回原版助手" : "Original assistant"}
          </Link>
        </div>
        <AgentConversation threadId={threadId} />
      </div>
    </CopilotKitProvider>
  );
}
