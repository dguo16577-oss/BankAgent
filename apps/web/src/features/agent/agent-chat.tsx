"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActionVerification } from "@/features/security/action-verification";
import { formatMoney } from "@/lib/money";
import { useLocale } from "@/lib/i18n/locale";
import { usePrepareTransfer } from "@/features/payments/use-payments";
import { parseAgentMessage, type AgentMessage } from "./agent-contract";
import { taskStepLabels } from "./agent-progress";

type Turn =
  | { id: number; role: "user"; message: string }
  | {
      id: number;
      role: "assistant";
      response: AgentMessage;
    };

const prompts = [
  "What is my account balance?",
  "How much did I spend this month?",
  "Where did my money go this month?",
  "Show my monthly spending trend this year",
  "Are there any unusual charges this month?",
  "Show my recent transactions",
  "How much did I transfer to Lin Wei this month?",
  "Transfer 10 CNY to Lin Wei",
  "How can I freeze my card?",
  "Show low-risk investment products",
  "What investments do I currently hold?",
];

const taskStepStatuses: Record<string, string> = {
  SUCCEEDED: "Completed",
  FAILED: "Failed",
  RUNNING: "In progress",
  PENDING: "Pending",
};

async function agentRequest(
  body: Record<string, unknown>,
): Promise<AgentMessage> {
  const response = await fetch("/api/agent/chat", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(
        new CustomEvent("bank-session-invalid", { detail: "UNAUTHENTICATED" }),
      );
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "The assistant could not complete this request.";
    throw new Error(message);
  }
  return parseAgentMessage(data);
}

export function AgentChat() {
  const { t, locale, errorMessage, formatDate } = useLocale();
  const router = useRouter();
  const prepare = usePrepareTransfer();
  const sequence = useRef(0);
  const proposalLocked = useRef(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [preparingId, setPreparingId] = useState<number>();
  const [proposalError, setProposalError] = useState<{
    turnId: number;
    message: string;
  }>();
  const [activeTaskId, setActiveTaskId] = useState<string>();
  const [activeIntentId, setActiveIntentId] = useState<string>();
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskError, setTaskError] = useState<string>();

  function receive(response: AgentMessage) {
    setTurns((previous) => [
      ...previous,
      { id: ++sequence.current, role: "assistant", response },
    ]);
    if (response.task) {
      setActiveIntentId(response.task.confirmation?.id);
      setActiveTaskId(
        ["FAILED", "CANCELLED"].includes(response.task.status) ||
          (response.task.status === "SUCCEEDED" && !!response.task.receipt)
          ? undefined
          : response.task.taskId,
      );
    }
  }

  async function send(message: string) {
    const trimmed = message.trim();
    if (pending || !trimmed || trimmed.length > 2000) return;
    setError(undefined);
    setDraft("");
    setTurns((previous) => [
      ...previous,
      { id: ++sequence.current, role: "user", message: trimmed },
    ]);
    setPending(true);
    try {
      const response = await agentRequest({
        message: trimmed,
        locale,
        requestId: crypto.randomUUID().replaceAll("-", ""),
        ...(activeTaskId ? { taskId: activeTaskId } : {}),
      });
      receive(response);
    } catch (cause) {
      setError(
        errorMessage(
          cause instanceof Error
            ? cause
            : new Error("The assistant could not complete this request."),
        ),
      );
    } finally {
      setPending(false);
    }
  }

  async function finishTask(
    taskId: string,
    action: "CONFIRM" | "CANCEL",
    intent?: { id: string; intentHash: string },
    authorizationId?: string,
  ) {
    if (taskBusy) return;
    setTaskBusy(true);
    setTaskError(undefined);
    try {
      const response = await agentRequest({
        action,
        taskId,
        ...(intent
          ? { intentId: intent.id, intentHash: intent.intentHash }
          : {}),
        ...(authorizationId ? { actionAuthorizationId: authorizationId } : {}),
      });
      receive(response);
      if (response.task?.errorCode) throw new Error(response.task.errorCode);
    } catch (cause) {
      const message = errorMessage(
        cause instanceof Error ? cause : new Error("Agent action failed."),
      );
      setTaskError(message ?? "Agent action failed.");
      throw cause;
    } finally {
      setTaskBusy(false);
    }
  }

  async function reviewTransfer(turn: Extract<Turn, { role: "assistant" }>) {
    const proposal = turn.response.proposal;
    if (proposal?.kind !== "TRANSFER" || proposalLocked.current) return;
    proposalLocked.current = true;
    setPreparingId(turn.id);
    setProposalError(undefined);
    try {
      const intent = await prepare.mutateAsync({
        sourceAccountId: proposal.sourceAccountId,
        recipientId: proposal.recipientId,
        amount: proposal.amount,
        note: "",
      });
      router.push(
        `/app/payments/transfers/review/${encodeURIComponent(intent.id)}`,
      );
    } catch (cause) {
      setProposalError({
        turnId: turn.id,
        message:
          errorMessage(
            cause instanceof Error
              ? cause
              : new Error("Could not prepare transfer."),
          ) ?? t("Could not prepare transfer."),
      });
      proposalLocked.current = false;
      setPreparingId(undefined);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-teal-800">
          <Sparkles size={18} aria-hidden="true" /> {t("AI Agent")}
        </p>
        <h1 className="text-3xl font-semibold">
          {t("Ask Aster about your banking")}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {t(
            "Check balances, spending, transactions and public banking information. For a transfer, the assistant can suggest details; you review and verify them before any money moves.",
          )}
        </p>
      </div>

      <details className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium">
          {t("Privacy and security")}
        </summary>
        <p className="mt-3 leading-6">
          {t(
            "With Agent v2, DeepSeek may receive your message and selected banking observations, including masked account and recipient details. Session cookies, passwords, verification codes and authorization tokens are not sent. Do not include secrets in messages.",
          )}
        </p>
      </details>

      <div
        className="flex flex-wrap gap-2"
        aria-label={t("Suggested questions")}
      >
        {prompts.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto max-w-full whitespace-normal text-left"
            disabled={pending || !!activeIntentId}
            onClick={() => void send(t(prompt))}
          >
            {t(prompt)}
          </Button>
        ))}
      </div>

      <section aria-label={t("Conversation")} className="space-y-4">
        {turns.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
            {t("Choose a question above or type your own message to begin.")}
          </div>
        )}
        {turns.map((turn) =>
          turn.role === "user" ? (
            <div
              key={turn.id}
              className="ml-auto max-w-[90%] rounded-xl bg-slate-900 p-4 text-sm leading-6 text-white sm:max-w-[75%]"
            >
              <p className="mb-1 text-xs font-semibold text-slate-300">
                {t("You")}
              </p>
              <p className="whitespace-pre-wrap break-words">{turn.message}</p>
            </div>
          ) : (
            <Card
              key={turn.id}
              className="max-w-[95%] shadow-none sm:max-w-[85%]"
            >
              <CardContent className="space-y-4 text-sm leading-6">
                <p className="font-semibold">{t("Aster Agent")}</p>
                <p className="whitespace-pre-wrap break-words">
                  {turn.response.reply}
                </p>
                {turn.response.task && turn.response.task.steps.length > 0 && (
                  <ol
                    className="space-y-1 rounded-lg border p-3 text-xs"
                    aria-label={t("Agent task steps")}
                  >
                    {turn.response.task.steps.map((step) => (
                      <li key={step.step_id}>
                        ✓ {t(taskStepLabels[step.tool] ?? step.tool)} ·{" "}
                        {t(taskStepStatuses[step.status] ?? step.status)}
                      </li>
                    ))}
                  </ol>
                )}
                {turn.response.task?.status === "WAITING_USER" &&
                  turn.response.task.options.length > 0 && (
                    <div
                      className="flex flex-wrap gap-2"
                      aria-label={t("Choose recipient")}
                    >
                      {turn.response.task.options.map((option, index) => (
                        <Button
                          key={option.recipient_id}
                          type="button"
                          variant="outline"
                          disabled={pending || taskBusy}
                          onClick={() => void send(`第${index + 1}个`)}
                        >
                          {option.display_name}
                          {option.account_mask
                            ? ` · ${option.account_mask}`
                            : ""}
                        </Button>
                      ))}
                    </div>
                  )}
                {turn.response.task?.confirmation &&
                  turn.response.task.status === "WAITING_CONFIRMATION" && (
                    <div
                      className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4"
                      aria-label={t("Transfer confirmation")}
                    >
                      <p className="font-semibold">
                        {turn.response.task.confirmationKind === "SCHEDULE"
                          ? "核对定时转账操作"
                          : turn.response.task.confirmationKind ===
                              "RECURRING_STOP"
                            ? "核对银行代扣撤销"
                            : turn.response.task.confirmationKind ===
                                "RENEWAL_REMINDER"
                              ? "核对续费提醒"
                              : turn.response.task.confirmationKind === "SPLIT"
                                ? "核对 AA 收款请求"
                                : turn.response.task.confirmationKind ===
                                    "CARD_ACTION"
                                  ? "核对卡片操作"
                                  : turn.response.task.confirmationKind ===
                                      "CARD_APPLICATION"
                                    ? "核对银行卡申请"
                                    : turn.response.task.confirmationKind ===
                                        "CREDIT_LIMIT_APPLICATION"
                                      ? "核对信用额度申请"
                                      : turn.response.task.confirmationKind ===
                                          "INVESTMENT_PURCHASE"
                                        ? "核对投资申购"
                                        : turn.response.task
                                              .confirmationKind ===
                                            "INVESTMENT_REDEMPTION"
                                          ? "核对投资赎回"
                                          : t("Review transfer")}
                      </p>
                      {"recipient" in turn.response.task.confirmation && (
                        <>
                          <p>
                            {
                              turn.response.task.confirmation.sourceAccount
                                .displayName
                            }{" "}
                            ·{" "}
                            {
                              turn.response.task.confirmation.sourceAccount
                                .maskedAccountNumber
                            }
                          </p>
                          <p>
                            →{" "}
                            {
                              turn.response.task.confirmation.recipient
                                .displayName
                            }{" "}
                            ·{" "}
                            {
                              turn.response.task.confirmation.recipient
                                .maskedAccountNumber
                            }
                          </p>
                          {turn.response.task.confirmation.recipient
                            .phoneMasked && (
                            <p>
                              {
                                turn.response.task.confirmation.recipient
                                  .phoneMasked
                              }
                            </p>
                          )}
                          <p className="text-xl font-semibold">
                            {formatMoney(
                              turn.response.task.confirmation.amount,
                            )}
                          </p>
                          <p>
                            {t("Fee")}:{" "}
                            {formatMoney(turn.response.task.confirmation.fee)}
                          </p>
                          <p>
                            {t("Total debit")}:{" "}
                            {formatMoney(
                              turn.response.task.confirmation.totalDebit,
                            )}
                          </p>
                        </>
                      )}
                      {"sourceAccount" in turn.response.task.confirmation &&
                        "product" in turn.response.task.confirmation && (
                          <div className="space-y-2">
                            <p>
                              产品：
                              {
                                turn.response.task.confirmation.product
                                  .displayName
                              }{" "}
                              · 风险{" "}
                              {
                                turn.response.task.confirmation.product
                                  .riskLevel
                              }
                            </p>
                            <p>
                              申购金额：
                              {formatMoney(
                                turn.response.task.confirmation.amount,
                              )}
                            </p>
                            <p>
                              费用：
                              {formatMoney(
                                turn.response.task.confirmation.fees,
                              )}
                            </p>
                            <p>
                              扣款合计：
                              {formatMoney(
                                turn.response.task.confirmation.totalDebit,
                              )}
                            </p>
                            <p>
                              来源账户：
                              {
                                turn.response.task.confirmation.sourceAccount
                                  .displayName
                              }{" "}
                              ·{" "}
                              {
                                turn.response.task.confirmation.sourceAccount
                                  .maskedAccountNumber
                              }
                            </p>
                            <p>
                              适当性结果：
                              {
                                turn.response.task.confirmation.suitability
                                  .result
                              }
                            </p>
                            <p>
                              请阅读产品流动性、费用与重要条款；演示收益不保证未来表现。
                            </p>
                          </div>
                        )}
                      {"holding" in turn.response.task.confirmation && (
                        <div className="space-y-2">
                          <p>
                            持仓：
                            {
                              turn.response.task.confirmation.holding
                                .displayName
                            }
                          </p>
                          <p>
                            赎回金额：
                            {formatMoney(
                              turn.response.task.confirmation.amount,
                            )}
                          </p>
                          <p>
                            费用：
                            {formatMoney(turn.response.task.confirmation.fees)}
                          </p>
                          <p>
                            演示到账额：
                            {formatMoney(
                              turn.response.task.confirmation.estimatedProceeds,
                            )}
                          </p>
                          <p>
                            到账账户：
                            {
                              turn.response.task.confirmation.destinationAccount
                                .displayName
                            }{" "}
                            ·{" "}
                            {
                              turn.response.task.confirmation.destinationAccount
                                .maskedAccountNumber
                            }
                          </p>
                          <p>
                            按演示成本加总价值即时结算；这里没有实时净值或实际投资收益。
                          </p>
                        </div>
                      )}
                      {"schedule" in turn.response.task.confirmation && (
                        <div className="space-y-2">
                          <p>
                            操作：{turn.response.task.confirmation.actionType}
                          </p>
                          <p>
                            收款人：
                            {
                              turn.response.task.confirmation.schedule.recipient
                                .displayName
                            }{" "}
                            ·{" "}
                            {
                              turn.response.task.confirmation.schedule.recipient
                                .maskedAccountNumber
                            }
                          </p>
                          <p>
                            金额：
                            {formatMoney(
                              turn.response.task.confirmation.schedule.amount,
                            )}
                          </p>
                          <p>
                            执行时间：
                            {formatDate(
                              turn.response.task.confirmation.schedule.dueAt,
                              true,
                            )}
                          </p>
                          <p>
                            确认操作只创建或取消定时任务；资金仅在到期且条件满足时转出。
                          </p>
                        </div>
                      )}
                      {"split" in turn.response.task.confirmation && (
                        <div className="space-y-2">
                          <p>
                            操作：{turn.response.task.confirmation.actionType}
                          </p>
                          <p>
                            总额：
                            {formatMoney(
                              turn.response.task.confirmation.split.totalAmount,
                            )}
                          </p>
                          <p>
                            本人份额：
                            {formatMoney(
                              turn.response.task.confirmation.split.payerShare,
                            )}
                          </p>
                          <ul className="list-inside list-disc">
                            {turn.response.task.confirmation.split.participants.map(
                              (participant) => (
                                <li key={participant.id}>
                                  {participant.displayName} ·{" "}
                                  {participant.maskedAccountNumber}：
                                  {formatMoney(participant.amountDue)}
                                </li>
                              ),
                            )}
                          </ul>
                          <p>创建收款请求不会扣除参与者资金。</p>
                        </div>
                      )}
                      {"recurringPayment" in turn.response.task.confirmation &&
                        "before" in turn.response.task.confirmation && (
                          <div className="space-y-2">
                            <p>
                              银行安排：
                              {
                                turn.response.task.confirmation.recurringPayment
                                  .displayName
                              }
                            </p>
                            <p>
                              状态：
                              {
                                turn.response.task.confirmation.before.status
                              } → {turn.response.task.confirmation.after.status}
                            </p>
                            <p>
                              确认后仅停止银行管理的未来代扣安排；第三方会员不会由此取消。
                            </p>
                          </div>
                        )}
                      {("recurringPaymentId" in
                        turn.response.task.confirmation ||
                        "patternReference" in
                          turn.response.task.confirmation) &&
                        "dateBasis" in turn.response.task.confirmation && (
                          <div className="space-y-2">
                            <p>
                              操作：{turn.response.task.confirmation.actionType}
                            </p>
                            <p>
                              {turn.response.task.confirmation.patternReference
                                ? "历史扣费模式："
                                : "银行记录："}
                              {turn.response.task.confirmation
                                .patternReference ??
                                turn.response.task.confirmation
                                  .recurringPaymentId}
                            </p>
                            {turn.response.task.confirmation.dueAt && (
                              <p>
                                提醒时间：
                                {formatDate(
                                  turn.response.task.confirmation.dueAt,
                                  true,
                                )}
                              </p>
                            )}
                            <p>
                              关联项目：
                              {turn.response.task.confirmation.dateBasis ===
                              "BANK_SCHEDULE"
                                ? "银行管理的代扣安排"
                                : "根据历史交易推测的周期扣费"}
                            </p>
                            {turn.response.task.confirmation.actionType !==
                              "CANCEL" && (
                              <>
                                <p>
                                  提醒时间由你指定，不代表银行确认该时间会扣款。
                                </p>
                                <p>仅在应用内生成提醒，不会发送短信或邮件。</p>
                              </>
                            )}
                          </div>
                        )}
                      {"card" in turn.response.task.confirmation &&
                        "before" in turn.response.task.confirmation && (
                          <div className="space-y-2">
                            <p>
                              卡片：
                              {
                                turn.response.task.confirmation.card.displayName
                              }{" "}
                              ·{" "}
                              {
                                turn.response.task.confirmation.card
                                  .maskedNumber
                              }
                            </p>
                            <p>
                              操作：{turn.response.task.confirmation.actionType}
                            </p>
                            <p>
                              状态：
                              {
                                turn.response.task.confirmation.before.status
                              } → {turn.response.task.confirmation.after.status}
                            </p>
                            {turn.response.task.confirmation.actionType ===
                              "UPDATE_CONTROLS" && (
                              <p>
                                确认后交易控制将更新；请核对复核单中的完整开关状态。
                              </p>
                            )}
                            {turn.response.task.confirmation.actionType ===
                              "UPDATE_LIMITS" && (
                              <p>
                                每笔限额：
                                {
                                  turn.response.task.confirmation.after.limits
                                    ?.perTransaction
                                }{" "}
                                CNY；每日限额：
                                {
                                  turn.response.task.confirmation.after.limits
                                    ?.daily
                                }{" "}
                                CNY。银行授予的信用额度不会因此提高。
                              </p>
                            )}
                            {turn.response.task.confirmation.actionType ===
                              "REPORT_LOST" && (
                              <p>正式挂失后不能通过普通解锁恢复此卡。</p>
                            )}
                          </div>
                        )}
                      {"request" in turn.response.task.confirmation && (
                        <div className="space-y-2">
                          <p>
                            产品：
                            {turn.response.task.confirmation.request.productId}
                          </p>
                          <p>
                            联系邮箱：
                            {
                              turn.response.task.confirmation.request
                                .contactEmail
                            }
                          </p>
                          <p>确认仅提交申请；审批和发卡由银行处理。</p>
                        </div>
                      )}
                      {"requestedLimit" in turn.response.task.confirmation && (
                        <div className="space-y-2">
                          <p>
                            卡片 ID：{turn.response.task.confirmation.cardId}
                          </p>
                          <p>
                            当前信用额度：
                            {turn.response.task.confirmation.currentLimit} CNY
                          </p>
                          <p>
                            申请额度：
                            {turn.response.task.confirmation.requestedLimit} CNY
                          </p>
                          <p>确认仅提交申请；银行审核前额度保持不变。</p>
                        </div>
                      )}
                      <p>
                        {t("Expires")}:{" "}
                        {formatDate(
                          turn.response.task.confirmation.expiresAt,
                          true,
                        )}
                      </p>
                      <div className="flex flex-wrap items-start gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            pending ||
                            taskBusy ||
                            activeTaskId !== turn.response.task.taskId ||
                            activeIntentId !==
                              turn.response.task.confirmation.id
                          }
                          onClick={() =>
                            void finishTask(
                              turn.response.task!.taskId,
                              "CANCEL",
                            )
                          }
                        >
                          {t("Cancel")}
                        </Button>
                        {turn.response.task.confirmationKind ===
                          "RENEWAL_REMINDER" ||
                        (turn.response.task.confirmationKind ===
                          "CARD_ACTION" &&
                          "verificationRequirement" in
                            turn.response.task.confirmation &&
                          turn.response.task.confirmation
                            .verificationRequirement === "NONE") ? (
                          <Button
                            type="button"
                            disabled={
                              pending ||
                              taskBusy ||
                              activeTaskId !== turn.response.task.taskId ||
                              activeIntentId !==
                                turn.response.task.confirmation.id
                            }
                            onClick={() =>
                              void finishTask(
                                turn.response.task!.taskId,
                                "CONFIRM",
                                turn.response.task!.confirmation,
                              )
                            }
                          >
                            {turn.response.task.confirmationKind ===
                            "RENEWAL_REMINDER"
                              ? "actionType" in
                                  turn.response.task.confirmation &&
                                turn.response.task.confirmation.actionType ===
                                  "CANCEL"
                                ? locale === "zh-CN"
                                  ? "确认取消提醒"
                                  : "Confirm reminder cancellation"
                                : locale === "zh-CN"
                                  ? "确认提醒操作"
                                  : "Confirm reminder"
                              : locale === "zh-CN"
                                ? "确认卡片操作"
                                : "Confirm card action"}
                          </Button>
                        ) : (
                          <ActionVerification
                            action={
                              turn.response.task.confirmationKind ===
                                "CARD_ACTION" &&
                              "actionType" in turn.response.task.confirmation
                                ? turn.response.task.confirmation.actionType ===
                                  "UNFREEZE"
                                  ? "CARD_UNFREEZE"
                                  : turn.response.task.confirmation
                                        .actionType === "FREEZE"
                                    ? "CARD_FREEZE"
                                    : "riskDirection" in
                                          turn.response.task.confirmation &&
                                        turn.response.task.confirmation
                                          .riskDirection === "RISK_INCREASING"
                                      ? "CARD_CONTROL_RISK_INCREASING"
                                      : "CARD_CONTROL_PROTECTIVE"
                                : turn.response.task.confirmationKind ===
                                    "RECURRING_STOP"
                                  ? "RECURRING_STOP_FUTURE_PAYMENTS"
                                  : turn.response.task.confirmationKind ===
                                      "CARD_APPLICATION"
                                    ? "CARD_APPLICATION_SUBMIT"
                                    : turn.response.task.confirmationKind ===
                                        "CREDIT_LIMIT_APPLICATION"
                                      ? "CREDIT_LIMIT_APPLICATION_SUBMIT"
                                      : turn.response.task.confirmationKind ===
                                          "SCHEDULE"
                                        ? "actionType" in
                                            turn.response.task.confirmation &&
                                          turn.response.task.confirmation
                                            .actionType === "CANCEL"
                                          ? "SCHEDULED_PAYMENT_CANCEL"
                                          : "SCHEDULED_PAYMENT_CREATE"
                                        : turn.response.task
                                              .confirmationKind === "SPLIT"
                                          ? "actionType" in
                                              turn.response.task.confirmation &&
                                            turn.response.task.confirmation
                                              .actionType === "CANCEL"
                                            ? "SPLIT_REQUEST_CANCEL"
                                            : "SPLIT_REQUEST_CREATE"
                                          : turn.response.task
                                                .confirmationKind ===
                                                "INVESTMENT_PURCHASE" ||
                                              turn.response.task
                                                .confirmationKind ===
                                                "INVESTMENT_REDEMPTION"
                                            ? "INVESTMENT_ORDER_EXECUTE"
                                            : "TRANSFER_EXECUTE"
                            }
                            resourceType={
                              turn.response.task.confirmationKind ===
                              "CARD_ACTION"
                                ? "CARD_ACTION_INTENT"
                                : turn.response.task.confirmationKind ===
                                    "RECURRING_STOP"
                                  ? "RECURRING_PAYMENT_INTENT"
                                  : turn.response.task.confirmationKind ===
                                      "CARD_APPLICATION"
                                    ? "APPLICATION_INTENT"
                                    : turn.response.task.confirmationKind ===
                                        "CREDIT_LIMIT_APPLICATION"
                                      ? "CREDIT_LIMIT_INTENT"
                                      : turn.response.task.confirmationKind ===
                                          "SCHEDULE"
                                        ? "SCHEDULE_ACTION_INTENT"
                                        : turn.response.task
                                              .confirmationKind === "SPLIT"
                                          ? "SPLIT_ACTION_INTENT"
                                          : turn.response.task
                                                .confirmationKind ===
                                                "INVESTMENT_PURCHASE" ||
                                              turn.response.task
                                                .confirmationKind ===
                                                "INVESTMENT_REDEMPTION"
                                            ? "INVESTMENT_ORDER_INTENT"
                                            : "TRANSFER_INTENT"
                            }
                            resourceId={turn.response.task.confirmation.id}
                            resourceHash={
                              turn.response.task.confirmation.intentHash
                            }
                            label={
                              turn.response.task.confirmationKind ===
                              "CARD_ACTION"
                                ? locale === "zh-CN"
                                  ? "确认卡片操作"
                                  : "Confirm card action"
                                : turn.response.task.confirmationKind ===
                                    "RECURRING_STOP"
                                  ? locale === "zh-CN"
                                    ? "确认撤销银行代扣"
                                    : "Stop bank debit"
                                  : turn.response.task.confirmationKind ===
                                      "CARD_APPLICATION"
                                    ? locale === "zh-CN"
                                      ? "提交银行卡申请"
                                      : "Submit card application"
                                    : turn.response.task.confirmationKind ===
                                        "CREDIT_LIMIT_APPLICATION"
                                      ? locale === "zh-CN"
                                        ? "提交额度申请"
                                        : "Submit limit request"
                                      : turn.response.task.confirmationKind ===
                                          "SCHEDULE"
                                        ? locale === "zh-CN"
                                          ? "确认定时转账"
                                          : "Confirm scheduled transfer"
                                        : turn.response.task
                                              .confirmationKind === "SPLIT"
                                          ? locale === "zh-CN"
                                            ? "确认 AA 收款请求"
                                            : "Confirm AA request"
                                          : turn.response.task
                                                .confirmationKind ===
                                              "INVESTMENT_PURCHASE"
                                            ? locale === "zh-CN"
                                              ? "确认理财申购"
                                              : "Confirm investment purchase"
                                            : turn.response.task
                                                  .confirmationKind ===
                                                "INVESTMENT_REDEMPTION"
                                              ? locale === "zh-CN"
                                                ? "确认理财赎回"
                                                : "Confirm investment redemption"
                                              : locale === "zh-CN"
                                                ? "确认转账"
                                                : "Confirm transfer"
                            }
                            disabled={
                              pending ||
                              taskBusy ||
                              activeTaskId !== turn.response.task.taskId ||
                              activeIntentId !==
                                turn.response.task.confirmation.id
                            }
                            onVerified={(authorizationId) =>
                              finishTask(
                                turn.response.task!.taskId,
                                "CONFIRM",
                                turn.response.task!.confirmation,
                                authorizationId,
                              )
                            }
                          />
                        )}
                      </div>
                      {taskError && (
                        <p role="alert" className="text-destructive">
                          {taskError}
                        </p>
                      )}
                    </div>
                  )}
                {turn.response.task?.receipt && (
                  <p className="rounded-lg bg-teal-50 p-3">
                    {turn.response.task.receiptKind === "TRANSFER"
                      ? t("Transfer completed.")
                      : turn.response.task.receiptKind === "RECURRING_STOP"
                        ? locale === "zh-CN"
                          ? "银行代扣安排已停止；第三方会员状态未改变。"
                          : "Bank debit arrangement stopped; third-party membership unchanged."
                        : turn.response.task.receiptKind === "RENEWAL_REMINDER"
                          ? locale === "zh-CN"
                            ? "应用内提醒已更新。"
                            : "In-app reminder updated."
                          : turn.response.task.receiptKind === "SCHEDULE"
                            ? locale === "zh-CN"
                              ? "定时转账操作已完成。"
                              : "Scheduled transfer action completed."
                            : turn.response.task.receiptKind === "SPLIT"
                              ? locale === "zh-CN"
                                ? "AA 请求已创建或取消，参与者资金未扣除。"
                                : "AA request created or cancelled; no participant funds were debited."
                              : turn.response.task.receiptKind === "CARD_ACTION"
                                ? locale === "zh-CN"
                                  ? "卡片操作已由银行执行。"
                                  : "Card action executed by the bank."
                                : turn.response.task.receiptKind ===
                                    "CREDIT_LIMIT_APPLICATION"
                                  ? locale === "zh-CN"
                                    ? "信用额度申请已提交，等待银行审核。"
                                    : "Credit limit application submitted for bank review."
                                  : turn.response.task.receiptKind ===
                                      "CARD_APPLICATION"
                                    ? locale === "zh-CN"
                                      ? "银行卡申请已提交，等待银行审核。"
                                      : "Card application submitted for bank review."
                                    : locale === "zh-CN"
                                      ? "操作已完成。"
                                      : "Action completed."}{" "}
                    {t("Reference")}:{" "}
                    {String(
                      turn.response.task.receipt.reference ??
                        turn.response.task.receipt.id ??
                        "",
                    )}
                  </p>
                )}
                {turn.response.citations.length > 0 && (
                  <div className="space-y-1 border-t pt-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {t("Sources")}
                    </p>
                    <ul className="flex flex-wrap gap-3">
                      {turn.response.citations.map((citation, index) => (
                        <li key={`${citation.url}-${index}`}>
                          <a
                            href={citation.url}
                            className="inline-flex items-center gap-1 text-primary underline"
                            target={
                              citation.url.startsWith("https://")
                                ? "_blank"
                                : undefined
                            }
                            rel={
                              citation.url.startsWith("https://")
                                ? "noopener noreferrer"
                                : undefined
                            }
                          >
                            {citation.title}
                            <ArrowUpRight size={14} aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {turn.response.proposal?.kind === "TRANSFER" && (
                  <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
                    <p className="font-semibold">{t("Transfer proposal")}</p>
                    <p>{turn.response.proposal.summary}</p>
                    <Button
                      type="button"
                      disabled={preparingId !== undefined}
                      onClick={() => void reviewTransfer(turn)}
                    >
                      {t(
                        preparingId === turn.id
                          ? "Preparing review…"
                          : "Review transfer proposal",
                      )}
                    </Button>
                    {proposalError?.turnId === turn.id && (
                      <p role="alert" className="text-destructive">
                        {proposalError.message}
                      </p>
                    )}
                  </div>
                )}
                {turn.response.proposal?.kind === "NAVIGATE" && (
                  <div className="space-y-3 rounded-lg border bg-secondary p-4">
                    <p>{turn.response.proposal.summary}</p>
                    <Button asChild variant="outline">
                      <Link href={turn.response.proposal.href}>
                        {t("Open suggested page")}
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ),
        )}
        {pending && (
          <p role="status" className="text-sm text-muted-foreground">
            {locale === "zh-CN"
              ? "正在处理请求并核对银行数据，请稍候…"
              : "Processing your request and checking bank data…"}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        className="space-y-3 rounded-xl border bg-white p-4"
      >
        <label htmlFor="agent-message" className="block text-sm font-semibold">
          {t("Your message")}
        </label>
        <textarea
          id="agent-message"
          aria-label={t("Message Aster Agent")}
          rows={3}
          maxLength={2000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="w-full resize-y rounded-lg border p-3 text-sm outline-none focus:ring-2 focus:ring-teal-500"
          placeholder={t(
            "Ask about your accounts, spending, transactions or a transfer…",
          )}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{draft.length}/2000</p>
          <Button disabled={pending || !draft.trim()} type="submit">
            <Send size={16} aria-hidden="true" />
            {t("Send message")}
          </Button>
        </div>
      </form>
    </div>
  );
}
