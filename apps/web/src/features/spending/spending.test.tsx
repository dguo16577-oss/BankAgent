import { verifiedIntent, authorizationFor } from "@/test/verification";
import { completeVerification } from "@/test/verification-ui";
import { beforeEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { spendingSummary } from "@/mocks/bank/spending-analytics";
import { RecurringService } from "@/mocks/bank/recurring-service";
import { SpendingDashboard } from "./spending-dashboard";
import { RecurringList } from "./recurring-list";
import { RecurringDetail } from "./recurring-detail";
import { RecurringActionReview } from "./recurring-action-review";
import { RecurringActionReceipt } from "./recurring-action-receipt";
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
});
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}
const service = new RecurringService(bankingStore);
const prepare = () =>
  verifiedIntent(
    service.prepare({
      recurringPaymentId: "rec_netflix",
      actionType: "STOP_FUTURE_PAYMENTS",
    }),
  );
it("renders loading then exact spending comparison, categories, merchant drilldown and recurring cards", async () => {
  mount(<SpendingDashboard />);
  expect(screen.getByText("Loading spending analytics…")).toBeInTheDocument();
  expect(await screen.findByTestId("spending-total")).toHaveTextContent(
    "¥4,968.00",
  );
  expect(screen.getByText("+3.50% vs comparison period")).toBeInTheDocument();
  expect(screen.getByText(/Comparison:.*Aug/)).toBeInTheDocument();
  const dining = screen.getByRole("link", { name: /Dining/ });
  const url = new URL(dining.getAttribute("href")!, "http://localhost");
  expect(url.searchParams.get("category")).toBe("DINING");
  expect(url.searchParams.get("to")).toBe("2026-09-27T10:30:00+08:00");
  expect(
    screen.getByRole("link", { name: /Weekly groceries/ }).getAttribute("href"),
  ).toContain("search=Weekly+groceries");
  expect(screen.getByLabelText("Daily spending trend")).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: /Netflix.*Monthly/ }),
  ).toHaveAttribute("href", "/app/spending/recurring/rec_netflix");
});
it("requests previous month, custom dates and account-scoped analytics through the API", async () => {
  mount(<SpendingDashboard />);
  await screen.findByTestId("spending-total");
  await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
  await waitFor(() =>
    expect(screen.getByTestId("spending-total")).toHaveTextContent("¥5,400.00"),
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Spending account"),
    "acc_usd",
  );
  await waitFor(() =>
    expect(screen.getByTestId("spending-total")).toHaveTextContent("$187.00"),
  );
  await userEvent.selectOptions(screen.getByLabelText("Spending account"), "");
  await userEvent.click(screen.getByRole("button", { name: "Custom range" }));
  await userEvent.type(screen.getByLabelText("From date"), "2026-09-26");
  await userEvent.type(screen.getByLabelText("Through date"), "2026-09-26");
  await userEvent.click(screen.getByRole("button", { name: "Apply dates" }));
  await waitFor(() =>
    expect(screen.getByTestId("spending-total")).toHaveTextContent("¥204.50"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Current month" }));
  await waitFor(() =>
    expect(screen.getByTestId("spending-total")).toHaveTextContent("¥4,968.00"),
  );
});
it("handles empty and partial analytics without hiding independently loaded recurring payments", async () => {
  const state = bankingStore.read();
  state.transactions = [];
  server.use(
    http.get("/customer/spending/summary", () =>
      HttpResponse.json(spendingSummary(state)),
    ),
  );
  mount(<SpendingDashboard />);
  expect(
    await screen.findByText("No completed spending in this period."),
  ).toBeInTheDocument();
  expect(screen.getByText("No categories in this period.")).toBeInTheDocument();
  expect(
    screen.getByText("No merchant spending in this period."),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: /Netflix.*Monthly/ }),
  ).toBeInTheDocument();
  cleanup();
  state.transactions = [
    bankingStore.read().transactions.find((t) => t.id === "txn_rec_rent")!,
  ];
  mount(<SpendingDashboard />);
  expect(await screen.findByTestId("spending-total")).toHaveTextContent(
    "¥3,000.00",
  );
  expect(
    screen.getByText("No merchant spending in this period."),
  ).toBeInTheDocument();
});
it("retries analytics errors and preserves the recurring section", async () => {
  server.use(
    http.get(
      "/customer/spending/summary",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<SpendingDashboard />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: /Netflix.*Monthly/ }),
  ).toBeInTheDocument();
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByTestId("spending-total")).toHaveTextContent(
    "¥4,968.00",
  );
});
it("handles recurring list empty and retry", async () => {
  server.use(
    http.get("/customer/recurring-payments", () =>
      HttpResponse.json({ items: [] }),
    ),
  );
  mount(<RecurringList />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(
    await screen.findByText("No recurring payments to display."),
  ).toBeInTheDocument();
  cleanup();
  server.use(
    http.get(
      "/customer/recurring-payments",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<RecurringList />);
  await screen.findByRole("alert");
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("link", { name: /Netflix/ }),
  ).toBeInTheDocument();
});
it("shows managed detail, related transaction links and prepares without stopping", async () => {
  mount(<RecurringDetail recurringPaymentId="rec_netflix" />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Netflix" }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("recurring-status")).toHaveTextContent("ACTIVE");
  expect(screen.getByText("Card subscription")).toBeInTheDocument();
  expect(screen.getByText("Bank managed")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "View Netflix payment 1" }),
  ).toHaveAttribute("href", "/app/transactions/txn_rec_netflix");
  expect(
    screen.getByRole("link", { name: "View linked card" }),
  ).toHaveAttribute("href", "/app/cards/card_aster_debit");
  await userEvent.click(
    screen.getByRole("button", { name: "Stop future payments" }),
  );
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
  expect(service.detail("rec_netflix").status).toBe("ACTIVE");
  expect(nav.push.mock.calls[0][0]).toMatch(
    /actions\/review\/recurring_intent_/,
  );
});
it("renders detection provenance and hides the stop button for detected-only patterns", async () => {
  mount(<RecurringDetail recurringPaymentId="rec_bookshop" />);
  expect(
    await screen.findByText("Detected from 3 similar monthly payments."),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/It cannot currently be managed through Aster Bank/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Stop future payments" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getAllByRole("link", { name: /View Bookshop payment/ }),
  ).toHaveLength(3);
});
it("renders detail 404 and retries detail/prepare errors", async () => {
  mount(<RecurringDetail recurringPaymentId="missing" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Recurring payment not found.",
  );
  cleanup();
  server.use(
    http.get(
      "/customer/recurring-payments/rec_netflix",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<RecurringDetail recurringPaymentId="rec_netflix" />);
  await screen.findByRole("alert");
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("heading", { name: "Netflix" });
  server.use(
    http.post(
      "/customer/recurring-payment-action-intents",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Stop future payments" }),
  );
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  server.resetHandlers();
  await userEvent.click(
    screen.getByRole("button", { name: "Stop future payments" }),
  );
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
});
it("reviews exact effects and confirms once, invalidating recurring and Overview caches", async () => {
  const intent = await prepare();
  server.use(
    http.post("/customer/recurring-payment-actions", async ({ request }) => {
      await delay(100);
      return HttpResponse.json(
        service.execute(
          await request.json(),
          request.headers.get("Idempotency-Key"),
        ),
      );
    }),
  );
  const client = mount(
    <RecurringActionReview
      recurringPaymentId="rec_netflix"
      intentId={intent.id}
    />,
  );
  for (const key of ["overview", "recurring", "spending", "accounts"]) {
    client.setQueryDefaults([key], { gcTime: Infinity });
    client.setQueryData([key], {});
  }
  expect(await screen.findByText("What will stop")).toBeInTheDocument();
  expect(screen.getByText("What will not happen")).toBeInTheDocument();
  expect(screen.getByTestId("recurring-change")).toHaveTextContent(
    "ACTIVE → STOPPED",
  );
  expect(screen.getByText(/may not terminate/)).toBeInTheDocument();
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Confirm stop future payments" }),
  );
  await completeVerification();
  await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  expect(Object.keys(bankingStore.read().recurringPaymentActions)).toHaveLength(
    1,
  );
  expect(client.getQueryState(["overview"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["recurring"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["spending"])?.isInvalidated).toBe(false);
  expect(client.getQueryState(["accounts"])?.isInvalidated).toBe(false);
});
it("safely retries an uncertain response using the original idempotency key", async () => {
  const intent = await prepare();
  let first = true;
  server.use(
    http.post("/customer/recurring-payment-actions", async ({ request }) => {
      const receipt = service.execute(
        await request.json(),
        request.headers.get("Idempotency-Key"),
      );
      if (first) {
        first = false;
        return HttpResponse.error();
      }
      return HttpResponse.json(receipt);
    }),
  );
  mount(
    <RecurringActionReview
      recurringPaymentId="rec_netflix"
      intentId={intent.id}
    />,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm stop future payments" }),
  );
  await completeVerification();
  await screen.findByRole("alert");
  await userEvent.click(
    screen.getByRole("button", { name: "Retry confirmation" }),
  );
  await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  expect(Object.keys(bankingStore.read().recurringPaymentActions)).toHaveLength(
    1,
  );
});
it("disables expired review and surfaces stale execution with a route to prepare again", async () => {
  const expired = await prepare();
  bankingStore.clock.advance(900000);
  mount(
    <RecurringActionReview
      recurringPaymentId="rec_netflix"
      intentId={expired.id}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("expired");
  expect(
    screen.getByRole("button", { name: "Confirm stop future payments" }),
  ).toBeDisabled();
  cleanup();
  const stale = await prepare();
  const state = bankingStore.read();
  state.recurringPayments.find((p) => p.id === "rec_netflix")!.version++;
  bankingStore.commit(state);
  mount(
    <RecurringActionReview
      recurringPaymentId="rec_netflix"
      intentId={stale.id}
    />,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm stop future payments" }),
  );
  await completeVerification();
  expect(await screen.findByRole("alert")).toHaveTextContent("state changed");
  expect(
    screen.getByRole("button", { name: "Retry confirmation" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("link", { name: /Back to recurring payment/ }),
  ).toBeInTheDocument();
});
it("shows persisted receipt and stopped detail without a stop action", async () => {
  const intent = await prepare();
  const receipt = service.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "receipt",
  );
  mount(
    <RecurringActionReceipt
      recurringPaymentId="rec_netflix"
      actionId={receipt.id}
    />,
  );
  expect(
    await screen.findByRole("heading", { name: "Future payments stopped" }),
  ).toBeInTheDocument();
  expect(screen.getByText(receipt.reference)).toBeInTheDocument();
  expect(screen.getByTestId("recurring-status")).toHaveTextContent("STOPPED");
  cleanup();
  mount(<RecurringDetail recurringPaymentId="rec_netflix" />);
  expect(await screen.findByText("No future payments")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Stop future payments" }),
  ).not.toBeInTheDocument();
});
it("handles review and receipt not found without rendering executable controls", async () => {
  mount(
    <RecurringActionReview
      recurringPaymentId="rec_netflix"
      intentId="missing"
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "intent not found",
  );
  expect(
    screen.queryByRole("button", { name: "Confirm stop future payments" }),
  ).not.toBeInTheDocument();
  cleanup();
  mount(
    <RecurringActionReceipt
      recurringPaymentId="rec_netflix"
      actionId="missing"
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "action not found",
  );
});
it("keeps section headings available to assistive technologies", async () => {
  mount(<SpendingDashboard />);
  await screen.findByTestId("spending-total");
  const heading = screen.getByRole("heading", { name: "Category breakdown" });
  expect(
    within(heading.parentElement!).getByRole("link", { name: /Dining/ }),
  ).toBeInTheDocument();
});
