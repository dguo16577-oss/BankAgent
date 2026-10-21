import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PendingAction, TaskProgressCard } from "./copilot-workspace";
import { parseAgentMessage } from "./agent-contract";

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: () => null,
  useAgent: vi.fn(),
}));
vi.mock("@/features/security/action-verification", () => ({
  ActionVerification: () => <button>Verify and confirm</button>,
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
