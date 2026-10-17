import { verifiedIntent, authorizationFor } from "@/test/verification";
import { completeVerification } from "@/test/verification-ui";
import { expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { SecurityService } from "@/mocks/bank/security-service";
import { securityFixture } from "@/mocks/data/security-fixture";
import { ScheduleService } from "@/mocks/bank/schedule-service";
import {
  ScheduleForm,
  ScheduledList,
  ScheduledDetail,
} from "./scheduled-payments";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}
const due = "2026-10-05T09:00:00+08:00";
async function create() {
  const service = new ScheduleService(bankingStore);
  const i = await verifiedIntent(
    service.prepare({
      actionType: "CREATE",
      sourceAccountId: "acc_current",
      recipientId: "recipient_zhang",
      amount: { amount: "500.00", currency: "CNY" },
      dueAt: due,
    }),
  );
  return service.confirm(
    {
      actionAuthorizationId: authorizationFor(i),
      intentId: i.id,
      intentHash: i.intentHash,
    },
    crypto.randomUUID(),
  );
}
it("shows empty scheduled list and contextual creation link", async () => {
  mount(<ScheduledList />);
  await screen.findByText("No scheduled payments yet.");
  expect(
    screen.getByRole("link", { name: "Schedule payment" }),
  ).toHaveAttribute("href", "/app/payments/scheduled/new");
});
it("reviews before creation and navigates to scheduled detail without debit", async () => {
  const before = bankingStore.read().accounts;
  mount(<ScheduleForm />);
  await screen.findByLabelText("Amount (CNY)");
  await userEvent.type(screen.getByLabelText("Amount (CNY)"), "500");
  const input = screen.getByLabelText(
    "Execution time (Asia/Shanghai, UTC+08:00)",
  );
  // datetime-local editing is native browser behavior; dispatch the final value in jsdom.
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.change(input, { target: { value: "2026-10-05T09:00" } });
  await userEvent.click(
    screen.getByRole("button", { name: "Review scheduled payment" }),
  );
  await screen.findByRole("button", { name: "Confirm schedule" });
  expect(Object.keys(bankingStore.read().schedules)).toHaveLength(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm schedule" }),
  );
  await completeVerification();
  await vi.waitFor(() =>
    expect(push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/app\/payments\/scheduled\/schedule_/),
    ),
  );
  expect(bankingStore.read().accounts).toEqual(before);
  expect(Object.keys(bankingStore.read().transfers)).toHaveLength(0);
});
it("lists a saved instruction and provides modify/cancel in context", async () => {
  const p = await create();
  mount(<ScheduledList />);
  await screen.findByRole("link", { name: "Zhang San" });
  cleanup();
  mount(<ScheduledDetail id={p.id} />);
  await screen.findByRole("link", { name: "Modify schedule" });
  expect(screen.getByText(/09:00/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Modify schedule" })).toHaveAttribute(
    "href",
    `/app/payments/scheduled/${p.id}/edit`,
  );
});
it("cancels only after review and preserves historical detail", async () => {
  const p = await create();
  mount(<ScheduledDetail id={p.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Cancel schedule" }),
  );
  await screen.findByRole("button", { name: "Confirm cancellation" });
  expect(bankingStore.read().schedules[p.id].status).toBe("SCHEDULED");
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm cancellation" }),
  );
  await completeVerification();
  await screen.findByText("Cancelled. No payment was made.");
  expect(bankingStore.read().schedules[p.id].status).toBe("CANCELLED");
});
it("amends with new review and advances version", async () => {
  const p = await create();
  mount(<ScheduleForm existing={p} />);
  const amount = await screen.findByLabelText("Amount (CNY)");
  await userEvent.clear(amount);
  await userEvent.type(amount, "650");
  await userEvent.click(
    screen.getByRole("button", { name: "Review scheduled payment" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm schedule" }),
  );
  await completeVerification();
  await vi.waitFor(() =>
    expect(bankingStore.read().schedules[p.id].amount.amount).toBe("650.00"),
  );
  expect(bankingStore.read().schedules[p.id].version).toBe(1);
});
it("renders executed linkage and preserves Spending", async () => {
  const p = await create();
  bankingStore.clock.reset(due);
  const baseline = bankingStore.read();
  baseline.asOf = due;
  bankingStore.commit(baseline);
  const before = bankingStore.overview().spending;
  await new ScheduleService(bankingStore).processDue();
  new SecurityService(bankingStore).login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  mount(<ScheduledDetail id={p.id} />);
  await screen.findByRole("link", { name: "View transfer receipt" });
  expect(bankingStore.overview().spending).toEqual(before);
});
it("renders failed state with no mutation controls", async () => {
  const p = await create();
  const next = bankingStore.read();
  next.recipients.find((r) => r.id === p.recipient.id)!.status = "INACTIVE";
  bankingStore.commit(next);
  bankingStore.clock.reset(due);
  await new ScheduleService(bankingStore).processDue();
  new SecurityService(bankingStore).login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  mount(<ScheduledDetail id={p.id} />);
  await screen.findByText(/Execution failed/);
  expect(
    screen.queryByRole("button", { name: "Cancel schedule" }),
  ).not.toBeInTheDocument();
});
it("supports API error and retry", async () => {
  server.use(
    http.get("/customer/scheduled-payments", () =>
      HttpResponse.json(
        { code: "INTERNAL_ERROR", message: "Unavailable" },
        { status: 500 },
      ),
    ),
  );
  mount(<ScheduledList />);
  await screen.findByRole("alert");
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("No scheduled payments yet.");
});
it("keeps unknown detail in an error state", async () => {
  mount(<ScheduledDetail id="missing" />);
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "Cancel schedule" }),
  ).not.toBeInTheDocument();
});
