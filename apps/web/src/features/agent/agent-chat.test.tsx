import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { AgentChat } from "./agent-chat";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

beforeEach(() => {
  nav.push.mockReset();
  localStorage.removeItem("aster.locale");
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AgentChat />
    </QueryClientProvider>,
  );
}

it("renders the assistant answer, citations and a transfer review action without moving money", async () => {
  server.use(
    http.post("/api/agent/chat", async ({ request }) => {
      expect(await request.json()).toMatchObject({
        message: "转给 Lin Wei 10 元",
        locale: "en",
      });
      return HttpResponse.json({
        reply: "我可以为你准备转账方案。",
        mode: "DETERMINISTIC",
        citations: [{ title: "转账", url: "/app/payments" }],
        proposal: {
          kind: "TRANSFER",
          sourceAccountId: "acc_current",
          recipientId: "recipient_zhang",
          amount: { amount: "10.00", currency: "CNY" },
          summary: "转给张三 10 元",
        },
      });
    }),
  );
  mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Message Aster Agent" }),
    "转给 Lin Wei 10 元",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(
    await screen.findByText("我可以为你准备转账方案。"),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "转账" })).toHaveAttribute(
    "href",
    "/app/payments",
  );
  expect(Object.keys(bankingStore.read().intents)).toHaveLength(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Review transfer proposal" }),
  );
  await waitFor(() =>
    expect(nav.push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/app\/payments\/transfers\/review\/intent_/),
    ),
  );
  expect(Object.keys(bankingStore.read().intents)).toHaveLength(1);
  expect(bankingStore.account("acc_current")?.balance.amount).toBe("23842.31");
});

it("sends the selected Chinese display language with the message", async () => {
  localStorage.setItem("aster.locale", "zh-CN");
  server.use(
    http.post("/api/agent/chat", async ({ request }) => {
      expect(await request.json()).toMatchObject({
        message: "我的余额是多少？",
        locale: "zh-CN",
      });
      return HttpResponse.json({
        reply: "你的余额可在账户页查看。",
        mode: "DETERMINISTIC",
        citations: [],
      });
    }),
  );
  mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "发送给 Aster 助手的消息" }),
    "我的余额是多少？",
  );
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  expect(
    await screen.findByText("你的余额可在账户页查看。"),
  ).toBeInTheDocument();
});

it("does not announce a bank debit stopped when only the preceding reminder was confirmed", async () => {
  localStorage.setItem("aster.locale", "zh-CN");
  server.use(
    http.post("/api/agent/chat", () =>
      HttpResponse.json({
        task_id: "f".repeat(32),
        status: "WAITING_CONFIRMATION",
        mode: "DEEPSEEK",
        message: "银行代扣撤销复核单已准备好。",
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
          { kind: "RENEWAL_REMINDER", receipt_id: "rma_reminder_1" },
        ],
      }),
    ),
  );
  mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "发送给 Aster 助手的消息" }),
    "设置提醒后停止 Rent 代扣",
  );
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  expect(await screen.findByText(/应用内提醒已更新/)).toBeInTheDocument();
  expect(screen.getByText(/核对银行代扣撤销/)).toBeInTheDocument();
  expect(screen.queryByText(/银行代扣安排已停止/)).not.toBeInTheDocument();
});

it("does not expose an unsafe navigation proposal", async () => {
  server.use(
    http.post("/api/agent/chat", () =>
      HttpResponse.json({
        reply: "Open a card page.",
        mode: "DEEPSEEK",
        citations: [],
        proposal: {
          kind: "NAVIGATE",
          href: "//evil.example/path",
          summary: "Open this page",
        },
      }),
    ),
  );
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "How can I freeze my card?" }),
  );
  expect(await screen.findByText("Open a card page.")).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Open suggested page" }),
  ).not.toBeInTheDocument();
});

it("shows the detected pattern and estimated due time before reminder confirmation", async () => {
  server.use(
    http.post("/api/agent/chat", () =>
      HttpResponse.json({
        task_id: "a".repeat(32),
        status: "WAITING_CONFIRMATION",
        message: "Review the in-app reminder.",
        steps: [],
        options: [],
        confirmation: {
          id: "rmi_pattern_1",
          intentHash: "b".repeat(64),
          actionType: "CREATE",
          targetType: "DETECTED_PATTERN",
          patternReference: "pat_" + "c".repeat(32),
          dateBasis: "ESTIMATED_FROM_HISTORY",
          dueAt: "2026-11-02T01:00:00Z",
          expiresAt: "2026-10-10T06:00:00Z",
        },
      }),
    ),
  );
  mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Message Aster Agent" }),
    "Remind me about Bookshop",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(
    await screen.findByText(/pat_cccccccccccccccccccccccccccccccc/),
  ).toBeInTheDocument();
  expect(screen.getByText(/根据历史交易推测的周期扣费/)).toBeInTheDocument();
  expect(screen.getByText(/提醒时间：/)).toBeInTheDocument();
});

it("shows the exact prepared intent and lets the customer cancel it", async () => {
  const taskId = "a".repeat(32);
  const intentHash = "b".repeat(64);
  const prepared = {
    task_id: taskId,
    status: "WAITING_CONFIRMATION",
    message: "Review the prepared transfer.",
    steps: [
      { step_id: "s1", tool: "list_accounts", status: "SUCCEEDED" },
      { step_id: "s2", tool: "resolve_recipient", status: "SUCCEEDED" },
      { step_id: "s3", tool: "prepare_transfer", status: "SUCCEEDED" },
    ],
    options: [],
    confirmation: {
      id: "intent_1",
      intentHash,
      expiresAt: "2099-01-01T00:00:00+08:00",
      sourceAccount: {
        displayName: "CNY Current",
        maskedAccountNumber: "••1048",
      },
      recipient: { displayName: "张三", maskedAccountNumber: "••8821" },
      amount: { amount: "500.00", currency: "CNY" },
      fee: { amount: "0.00", currency: "CNY" },
      totalDebit: { amount: "500.00", currency: "CNY" },
    },
  };
  server.use(
    http.post("/api/agent/chat", async ({ request }) => {
      const body = (await request.json()) as {
        action?: string;
        taskId?: string;
      };
      if (body.action === "CANCEL") {
        expect(body.taskId).toBe(taskId);
        return HttpResponse.json({
          task_id: taskId,
          status: "CANCELLED",
          message: "Cancelled.",
          steps: [],
          options: [],
        });
      }
      return HttpResponse.json(prepared);
    }),
  );
  mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Message Aster Agent" }),
    "给张三转500",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(
    await screen.findByText("Review the prepared transfer."),
  ).toBeInTheDocument();
  expect(screen.getByText(/张三 · ••8821/)).toBeInTheDocument();
  expect(screen.getAllByText(/500.00/).length).toBeGreaterThan(0);
  expect(
    screen.getByRole("button", { name: "Confirm transfer" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await screen.findByText("Cancelled.")).toBeInTheDocument();
  expect(Object.keys(bankingStore.read().intents)).toHaveLength(0);
});

it("shows neutral card and spending steps and preserves a read task for follow-up", async () => {
  const taskId = "c".repeat(32);
  const requests: unknown[] = [];
  server.use(
    http.post("/api/agent/chat", async ({ request }) => {
      const body: unknown = await request.json();
      requests.push(body);
      return HttpResponse.json({
        task_id: taskId,
        status: "SUCCEEDED",
        message:
          requests.length === 1
            ? "Card ending 6327 is active."
            : "Completed spending: CNY 199.85.",
        mode: "DEEPSEEK",
        steps:
          requests.length === 1
            ? [{ step_id: "s1", tool: "list_cards", status: "SUCCEEDED" }]
            : [
                { step_id: "s1", tool: "list_cards", status: "SUCCEEDED" },
                {
                  step_id: "s2",
                  tool: "summarize_spending",
                  status: "SUCCEEDED",
                },
              ],
        options: [],
      });
    }),
  );
  mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Message Aster Agent" }),
    "Check card ending 6327",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(
    await screen.findByText("Card ending 6327 is active."),
  ).toBeInTheDocument();
  expect(screen.getByText(/Query cards/)).toBeInTheDocument();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Message Aster Agent" }),
    "How much did this card spend?",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(
    await screen.findByText("Completed spending: CNY 199.85."),
  ).toBeInTheDocument();
  expect(screen.getByText(/Analyze spending/)).toBeInTheDocument();
  expect(requests[1]).toMatchObject({
    message: "How much did this card spend?",
    locale: "en",
    taskId,
  });
  expect(screen.queryByText(/Check accounts/)).not.toBeInTheDocument();
});

it("shows a read-only anomaly step without a financial confirmation", async () => {
  server.use(
    http.post("/api/agent/chat", () =>
      HttpResponse.json({
        task_id: "d".repeat(32),
        status: "SUCCEEDED",
        message:
          "Possible duplicate charge: transaction demo_1. Please review it.",
        mode: "DEEPSEEK",
        steps: [
          {
            step_id: "s1",
            tool: "detect_transaction_anomalies",
            status: "SUCCEEDED",
          },
        ],
        options: [],
      }),
    ),
  );
  mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Message Aster Agent" }),
    "Do I have duplicate charges?",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(
    await screen.findByText(/Possible duplicate charge/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Check unusual transactions/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Confirm transfer" }),
  ).not.toBeInTheDocument();
});
