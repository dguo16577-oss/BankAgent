import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  PendingAction,
  TaskProgressCard,
  recoveredStateFromTask,
} from "./copilot-workspace";
import { parseAgentMessage } from "./agent-contract";

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: () => null,
  useAgent: vi.fn(),
}));
vi.mock("@/features/security/action-verification", () => ({
  ActionVerification: ({ onVerified }: { onVerified: () => Promise<void> }) => (
    <button onClick={() => void onVerified()}>Verify and confirm</button>
  ),
}));

const taskId = "a".repeat(32);
const pending = {
  task_id: taskId,
  status: "WAITING_CONFIRMATION",
  mode: "DEEPSEEK",
  message: "Review",
  steps: [],
  confirmation: {
    id: "intent_one",
    intentHash: "b".repeat(64),
    amount: { amount: "1.00", currency: "CNY" },
    fee: {},
    totalDebit: {},
    sourceAccount: {},
    recipient: {},
    expiresAt: "2026-10-21T02:00:00Z",
  },
};
const completed = {
  ...pending,
  status: "SUCCEEDED",
  confirmation: null,
  receipt: { id: "transfer_one", status: "COMPLETED" },
  completed_actions: [{ kind: "TRANSFER", receipt_id: "transfer_one" }],
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("reads the owned receipt after confirmation conflict and never automatically resubmits", async () => {
  let posts = 0;
  const fetcher = vi.fn().mockImplementation((_url, options) => {
    if (options?.method === "POST") {
      posts++;
      return Promise.resolve(new Response("{}", { status: 409 }));
    }
    return Promise.resolve(Response.json(posts ? completed : pending));
  });
  vi.stubGlobal("fetch", fetcher);
  const resolved = vi.fn();
  render(
    <PendingAction
      state={{ taskId, status: "WAITING_CONFIRMATION" }}
      onResolved={resolved}
    />,
  );
  const button = await screen.findByRole("button", {
    name: "Verify and confirm",
  });
  await act(async () => {
    button.click();
  });
  expect(resolved).toHaveBeenCalledWith(
    expect.objectContaining({
      task: expect.objectContaining({ status: "SUCCEEDED" }),
    }),
  );
  expect(posts).toBe(1);
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(1);
});

it("shows every staged financial goal and cancels one separately from the whole task", async () => {
  const staged = {
    ...pending,
    financial_plan: [
      {
        step_id: "g1",
        goal: "给张三转100元",
        execution_state: "FINANCIAL_ACTION_PREPARED",
        intent_id: "intent_one",
      },
      {
        step_id: "g2",
        goal: "给李四转200元",
        execution_state: "NOT_PREPARED",
        intent_id: null,
      },
    ],
  };
  const fetcher = vi.fn().mockResolvedValue(Response.json(staged));
  vi.stubGlobal("fetch", fetcher);
  render(
    <PendingAction
      state={{ taskId, status: "WAITING_CONFIRMATION" }}
      onResolved={vi.fn()}
    />,
  );
  expect(await screen.findByText("给李四转200元")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Cancel this action and continue" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Cancel whole task" }),
  ).toBeInTheDocument();
});

it("a losing confirmation tab converges by owned GET without retrying a mutation", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(pending)))
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(completed))),
    );
  vi.stubGlobal("fetch", fetcher);
  const resolved = vi.fn();
  render(
    <PendingAction
      state={{ taskId, status: "WAITING_CONFIRMATION" }}
      onResolved={resolved}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(
    screen.getByRole("region", { name: "Bank action review" }),
  ).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(resolved).toHaveBeenCalledWith(
    expect.objectContaining({
      task: expect.objectContaining({ status: "SUCCEEDED" }),
    }),
  );
  expect(
    screen.queryByRole("region", { name: "Bank action review" }),
  ).not.toBeInTheDocument();
  expect(
    fetcher.mock.calls.every(
      ([url, options]) =>
        url === `/api/agent/tasks/${taskId}` && !options.method,
    ),
  ).toBe(true);
});

it("shows only a receipt bound to a completed action", () => {
  const result = parseAgentMessage(completed);
  const view = render(
    <TaskProgressCard state={undefined} bankResult={result} />,
  );
  expect(screen.getByText("transfer_one")).toBeInTheDocument();
  view.rerender(
    <TaskProgressCard
      state={undefined}
      bankResult={parseAgentMessage({ ...completed, completed_actions: [] })}
    />,
  );
  expect(screen.queryByText("transfer_one")).not.toBeInTheDocument();
});

it("restores a receipt after refresh from the authenticated owned task only", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(completed)));
  vi.stubGlobal("fetch", fetcher);
  render(
    <TaskProgressCard
      state={{ taskId, status: "SUCCEEDED", completedActionCount: 1 }}
      bankResult={undefined}
    />,
  );
  expect(await screen.findByText("transfer_one")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith(
    `/api/agent/tasks/${taskId}`,
    expect.objectContaining({ cache: "no-store" }),
  );
});

it("keeps the completed count through the actual recovery state mapping", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(completed))),
  );
  const recovered = recoveredStateFromTask({
    taskId,
    status: "SUCCEEDED",
    completedActionCount: 1,
    failedActionCount: 0,
  });
  render(<TaskProgressCard state={recovered} bankResult={undefined} />);
  expect(await screen.findByText("transfer_one")).toBeInTheDocument();
});

it("rejects invalid recovered counters and unvalidated role metadata", () => {
  const result = recoveredStateFromTask({
    taskId,
    status: "RUNNING",
    completedActionCount: -1,
    failedActionCount: Number.NaN,
    delegations: [{ agentRole: "attacker", status: "SUCCEEDED" }],
  });
  expect(result.completedActionCount).toBe(0);
  expect(result.failedActionCount).toBe(0);
  expect(result.delegations).toEqual([]);
});

it("does not consume a different task result and stops polling on unmount", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ...completed, task_id: "c".repeat(32) })),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const resolved = vi.fn();
  const view = render(
    <PendingAction
      state={{ taskId, status: "WAITING_CONFIRMATION" }}
      onResolved={resolved}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(resolved).not.toHaveBeenCalled();
  view.unmount();
  const calls = fetcher.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(fetcher).toHaveBeenCalledTimes(calls);
});
