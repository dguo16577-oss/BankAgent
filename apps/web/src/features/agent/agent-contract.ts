export type AgentCitation = { title: string; url: string };
export type TransferProposal = {
  kind: "TRANSFER";
  sourceAccountId: string;
  recipientId: string;
  amount: { amount: string; currency: "CNY" };
  summary: string;
};
export type NavigateProposal = {
  kind: "NAVIGATE";
  href: string;
  summary: string;
};
export type AgentProposal = TransferProposal | NavigateProposal;
export type AgentReply = {
  reply: string;
  mode: "DEEPSEEK" | "DETERMINISTIC";
  citations: AgentCitation[];
  proposal?: AgentProposal;
};
import type { components } from "@/generated/customer-api";

type BankTransferIntent = components["schemas"]["TransferIntent"];
type BankScheduleIntent = components["schemas"]["ScheduleActionIntent"];
type BankSplitIntent = components["schemas"]["SplitActionIntent"];
type BankInvestmentIntent = components["schemas"]["InvestmentOrderIntent"];
type BankRedemptionIntent = components["schemas"]["InvestmentRedemptionIntent"];
type BankCardIntent = components["schemas"]["CardActionIntent"];
type BankApplicationIntent = components["schemas"]["ApplicationIntent"];
type BankCreditLimitIntent = components["schemas"]["CreditLimitIntent"];
type BankRecurringIntent =
  components["schemas"]["RecurringPaymentActionIntent"];
type BankReminderIntent = components["schemas"]["RenewalReminderActionIntent"];
export type AgentConfirmation =
  | BankTransferIntent
  | BankScheduleIntent
  | BankSplitIntent
  | BankInvestmentIntent
  | BankRedemptionIntent
  | BankCardIntent
  | BankApplicationIntent
  | BankCreditLimitIntent
  | BankRecurringIntent
  | BankReminderIntent;
export type AgentTask = {
  taskId: string;
  status:
    | "PENDING"
    | "RUNNING"
    | "WAITING_USER"
    | "WAITING_CONFIRMATION"
    | "WAITING_AUTH"
    | "SUCCEEDED"
    | "PARTIAL"
    | "BLOCKED_PROVIDER"
    | "FAILED"
    | "CANCELLED";
  steps: { step_id: string; tool: string; status: string }[];
  confirmation?: AgentConfirmation;
  confirmationKind?:
    | "TRANSFER"
    | "SCHEDULE"
    | "SPLIT"
    | "INVESTMENT_PURCHASE"
    | "INVESTMENT_REDEMPTION"
    | "CARD_ACTION"
    | "CARD_APPLICATION"
    | "CREDIT_LIMIT_APPLICATION"
    | "RECURRING_STOP"
    | "RENEWAL_REMINDER";
  options: {
    recipient_id: string;
    display_name: string;
    account_mask: string;
  }[];
  receipt?: Record<string, unknown>;
  receiptKind?: AgentTask["confirmationKind"];
  completedActionCount: number;
  failedActionCount: number;
  errorCode?: string;
};
export type AgentMessage = AgentReply & { task?: AgentTask };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);

export function safeNavigationHref(href: unknown): href is string {
  return (
    typeof href === "string" &&
    /^\/app\/(?:cards\/[A-Za-z0-9_-]+|spending\/recurring\/[A-Za-z0-9_-]+)$/.test(
      href,
    )
  );
}

export function safeCitationHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  if (/^\/(?!\/)[A-Za-z0-9/_-]+$/.test(href)) return true;
  try {
    return new URL(href).protocol === "https:";
  } catch {
    return false;
  }
}

export function parseAgentReply(value: unknown): AgentReply {
  if (
    !record(value) ||
    typeof value.reply !== "string" ||
    (value.mode !== "DEEPSEEK" && value.mode !== "DETERMINISTIC")
  )
    throw new Error("The assistant returned an invalid response.");

  const citations: AgentCitation[] = Array.isArray(value.citations)
    ? value.citations
        .filter(
          (item): item is AgentCitation =>
            record(item) &&
            typeof item.title === "string" &&
            item.title.length <= 160 &&
            safeCitationHref(item.url),
        )
        .slice(0, 8)
    : [];
  let proposal: AgentProposal | undefined;
  const candidate = value.proposal;
  if (record(candidate) && typeof candidate.summary === "string") {
    if (
      candidate.kind === "TRANSFER" &&
      identifier(candidate.sourceAccountId) &&
      identifier(candidate.recipientId) &&
      record(candidate.amount) &&
      candidate.amount.currency === "CNY" &&
      typeof candidate.amount.amount === "string" &&
      /^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(candidate.amount.amount) &&
      /[1-9]/.test(candidate.amount.amount)
    ) {
      proposal = {
        kind: "TRANSFER",
        sourceAccountId: candidate.sourceAccountId,
        recipientId: candidate.recipientId,
        amount: {
          amount: candidate.amount.amount,
          currency: "CNY",
        },
        summary: candidate.summary.slice(0, 400),
      };
    } else if (
      candidate.kind === "NAVIGATE" &&
      safeNavigationHref(candidate.href)
    ) {
      proposal = {
        kind: "NAVIGATE",
        href: candidate.href,
        summary: candidate.summary.slice(0, 400),
      };
    }
  }
  return { reply: value.reply, mode: value.mode, citations, proposal };
}

export function parseAgentMessage(value: unknown): AgentMessage {
  if (!record(value) || typeof value.task_id !== "string")
    return parseAgentReply(value);
  if (
    !/^[a-f0-9]{32}$/.test(value.task_id) ||
    typeof value.message !== "string" ||
    ![
      "PENDING",
      "RUNNING",
      "WAITING_USER",
      "WAITING_CONFIRMATION",
      "WAITING_AUTH",
      "SUCCEEDED",
      "PARTIAL",
      "BLOCKED_PROVIDER",
      "FAILED",
      "CANCELLED",
    ].includes(String(value.status)) ||
    !Array.isArray(value.steps)
  )
    throw new Error("The assistant returned an invalid task.");
  const steps = value.steps
    .filter(
      (step) =>
        record(step) &&
        typeof step.step_id === "string" &&
        typeof step.tool === "string" &&
        typeof step.status === "string",
    )
    .map((step) => ({
      step_id: step.step_id as string,
      tool: step.tool as string,
      status: step.status as string,
    }));
  const options = Array.isArray(value.options)
    ? value.options
        .filter(
          (option) =>
            record(option) &&
            ((identifier(option.recipient_id) &&
              typeof option.display_name === "string" &&
              typeof option.account_mask === "string") ||
              (identifier(option.id) && typeof option.label === "string")),
        )
        .map((option) => ({
          recipient_id: (option.recipient_id ?? option.id) as string,
          display_name: (option.display_name ?? option.label) as string,
          account_mask: (option.account_mask ?? "") as string,
        }))
    : [];
  const raw = value.confirmation;
  let confirmation: AgentConfirmation | undefined;
  let confirmationKind: AgentTask["confirmationKind"];
  if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    record(raw.amount) &&
    typeof raw.amount.amount === "string" &&
    record(raw.fee) &&
    record(raw.totalDebit) &&
    record(raw.sourceAccount) &&
    record(raw.recipient) &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankTransferIntent;
    confirmationKind = "TRANSFER";
  } else if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    record(raw.schedule) &&
    typeof raw.actionType === "string" &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankScheduleIntent;
    confirmationKind = "SCHEDULE";
  } else if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    record(raw.split) &&
    typeof raw.actionType === "string" &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankSplitIntent;
    confirmationKind = "SPLIT";
  } else if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    record(raw.recurringPayment) &&
    record(raw.before) &&
    record(raw.after) &&
    raw.actionType === "STOP_FUTURE_PAYMENTS" &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankRecurringIntent;
    confirmationKind = "RECURRING_STOP";
  } else if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    (typeof raw.recurringPaymentId === "string" ||
      typeof raw.patternReference === "string") &&
    (raw.actionType === "CREATE" ||
      raw.actionType === "CHANGE" ||
      raw.actionType === "CANCEL") &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankReminderIntent;
    confirmationKind = "RENEWAL_REMINDER";
  } else if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    record(raw.product) &&
    record(raw.suitability) &&
    record(raw.sourceAccount) &&
    record(raw.amount) &&
    record(raw.fees) &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankInvestmentIntent;
    confirmationKind = "INVESTMENT_PURCHASE";
  } else if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    record(raw.holding) &&
    record(raw.destinationAccount) &&
    record(raw.amount) &&
    record(raw.estimatedProceeds) &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankRedemptionIntent;
    confirmationKind = "INVESTMENT_REDEMPTION";
  } else if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    record(raw.card) &&
    record(raw.before) &&
    record(raw.after) &&
    typeof raw.actionType === "string" &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankCardIntent;
    confirmationKind = "CARD_ACTION";
  } else if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    record(raw.request) &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankApplicationIntent;
    confirmationKind = "CARD_APPLICATION";
  } else if (
    record(raw) &&
    identifier(raw.id) &&
    typeof raw.intentHash === "string" &&
    /^[a-fA-F0-9]{64}$/.test(raw.intentHash) &&
    typeof raw.cardId === "string" &&
    typeof raw.requestedLimit === "string" &&
    typeof raw.expiresAt === "string"
  ) {
    confirmation = raw as BankCreditLimitIntent;
    confirmationKind = "CREDIT_LIMIT_APPLICATION";
  }
  if (
    (value.status === "WAITING_CONFIRMATION" ||
      value.status === "WAITING_AUTH") &&
    !confirmation
  )
    throw new Error("The assistant returned an invalid confirmation.");
  const receipt = record(value.receipt) ? value.receipt : undefined;
  const completedActions = Array.isArray(value.completed_actions)
    ? value.completed_actions
    : [];
  const lastAction = completedActions[completedActions.length - 1];
  const receiptKind =
    receipt &&
    record(lastAction) &&
    identifier(lastAction.receipt_id) &&
    lastAction.receipt_id === receipt.id &&
    [
      "TRANSFER",
      "SCHEDULE",
      "SPLIT",
      "INVESTMENT_PURCHASE",
      "INVESTMENT_REDEMPTION",
      "CARD_ACTION",
      "CARD_APPLICATION",
      "CREDIT_LIMIT_APPLICATION",
      "RECURRING_STOP",
      "RENEWAL_REMINDER",
    ].includes(String(lastAction.kind))
      ? (lastAction.kind as AgentTask["receiptKind"])
      : undefined;
  return {
    reply: value.message,
    mode: value.mode === "DEEPSEEK" ? "DEEPSEEK" : "DETERMINISTIC",
    citations: [],
    task: {
      taskId: value.task_id,
      status: value.status as AgentTask["status"],
      steps,
      confirmation,
      confirmationKind,
      options,
      receipt,
      receiptKind,
      completedActionCount: completedActions.length,
      failedActionCount: Array.isArray(value.failed_actions)
        ? value.failed_actions.length
        : 0,
      errorCode:
        typeof value.error_code === "string" ? value.error_code : undefined,
    },
  };
}
