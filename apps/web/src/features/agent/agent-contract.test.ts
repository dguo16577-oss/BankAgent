import { expect, it } from "vitest";
import {
  parseAgentMessage,
  parseAgentReply,
  safeNavigationHref,
} from "./agent-contract";

it("keeps a valid transfer proposal and rejects zero or malformed amounts", () => {
  const response = {
    reply: "Review this transfer.",
    mode: "DETERMINISTIC",
    citations: [],
    proposal: {
      kind: "TRANSFER",
      sourceAccountId: "acc_current",
      recipientId: "recipient_zhang",
      amount: { amount: "10.00", currency: "CNY" },
      summary: "Send CNY 10",
    },
  };
  expect(parseAgentReply(response).proposal).toEqual(response.proposal);
  expect(
    parseAgentReply({
      ...response,
      proposal: {
        ...response.proposal,
        amount: { amount: "0.00", currency: "CNY" },
      },
    }).proposal,
  ).toBeUndefined();
});

it("limits navigation proposals to known banking detail pages", () => {
  expect(safeNavigationHref("/app/cards/card_primary")).toBe(true);
  expect(safeNavigationHref("/app/spending/recurring/rec_rent")).toBe(true);
  expect(safeNavigationHref("//evil.example/path")).toBe(false);
  expect(safeNavigationHref("/app/payments/transfers/confirm/intent_1")).toBe(
    false,
  );
  expect(
    safeNavigationHref("/app/cards/card_primary?next=https://evil.example"),
  ).toBe(false);
});

it("keeps v2 recipient choices so an ambiguous task can resume", () => {
  const response = parseAgentMessage({
    task_id: "a".repeat(32),
    status: "WAITING_USER",
    mode: "DEEPSEEK",
    message: "请选择收款人",
    steps: [],
    options: [{ id: "recipient_zhang", label: "张三 · •••• 6018" }],
  });
  expect(response.task?.options).toEqual([
    {
      recipient_id: "recipient_zhang",
      display_name: "张三 · •••• 6018",
      account_mask: "",
    },
  ]);
});

it("parses bank-owned investment review cards and rejects incomplete redemption terms", () => {
  const common = {
    task_id: "b".repeat(32),
    status: "WAITING_CONFIRMATION",
    mode: "DEEPSEEK",
    message: "Review the investment.",
    steps: [],
  };
  const purchase = {
    id: "investment_intent_1",
    intentHash: "a".repeat(64),
    product: { id: "product_cash" },
    suitability: { result: "SUITABLE" },
    sourceAccount: { id: "acc_current" },
    amount: { amount: "5000.00", currency: "CNY" },
    fees: { amount: "0.00", currency: "CNY" },
    expiresAt: "2026-10-09T12:00:00+08:00",
  };
  expect(
    parseAgentMessage({ ...common, confirmation: purchase }).task
      ?.confirmationKind,
  ).toBe("INVESTMENT_PURCHASE");

  const redemption = {
    id: "redemption_intent_1",
    intentHash: "b".repeat(64),
    holding: { id: "holding_market" },
    destinationAccount: { id: "acc_current" },
    amount: { amount: "500.00", currency: "CNY" },
    estimatedProceeds: { amount: "500.00", currency: "CNY" },
    expiresAt: "2026-10-09T12:00:00+08:00",
  };
  expect(
    parseAgentMessage({ ...common, confirmation: redemption }).task
      ?.confirmationKind,
  ).toBe("INVESTMENT_REDEMPTION");
  expect(() =>
    parseAgentMessage({
      ...common,
      confirmation: { ...redemption, estimatedProceeds: undefined },
    }),
  ).toThrow("invalid confirmation");
});

it("recognizes bank debit and renewal reminder review intents", () => {
  const common = {
    task_id: "c".repeat(32),
    status: "WAITING_CONFIRMATION",
    mode: "DEEPSEEK",
    message: "Review this action.",
    steps: [],
  };
  const recurring = {
    id: "recurring_intent_1",
    intentHash: "c".repeat(64),
    actionType: "STOP_FUTURE_PAYMENTS",
    recurringPayment: { id: "rec_rent", displayName: "Rent" },
    before: { status: "ACTIVE" },
    after: { status: "STOPPED" },
    expiresAt: "2026-10-09T12:00:00+08:00",
  };
  expect(
    parseAgentMessage({ ...common, confirmation: recurring }).task
      ?.confirmationKind,
  ).toBe("RECURRING_STOP");
  const reminder = {
    id: "reminder_intent_1",
    intentHash: "d".repeat(64),
    actionType: "CREATE",
    recurringPaymentId: "rec_rent",
    dueAt: "2026-10-12T09:00:00+08:00",
    dateBasis: "BANK_SCHEDULE",
    expiresAt: "2026-10-09T12:00:00+08:00",
  };
  expect(
    parseAgentMessage({ ...common, confirmation: reminder }).task
      ?.confirmationKind,
  ).toBe("RENEWAL_REMINDER");
});

it("labels a completed receipt from its action rather than the next pending action", () => {
  const response = parseAgentMessage({
    task_id: "d".repeat(32),
    status: "WAITING_CONFIRMATION",
    mode: "DEEPSEEK",
    message: "Review stopping the bank debit.",
    steps: [],
    confirmation: {
      id: "stop_intent_1",
      intentHash: "e".repeat(64),
      actionType: "STOP_FUTURE_PAYMENTS",
      recurringPayment: { id: "rec_rent", displayName: "Rent" },
      before: { status: "ACTIVE" },
      after: { status: "STOPPED" },
      expiresAt: "2026-10-10T14:33:00+08:00",
    },
    receipt: { id: "rma_reminder_1" },
    completed_actions: [
      {
        kind: "RENEWAL_REMINDER",
        receipt_id: "rma_reminder_1",
      },
    ],
  });
  expect(response.task?.confirmationKind).toBe("RECURRING_STOP");
  expect(response.task?.receiptKind).toBe("RENEWAL_REMINDER");
});
