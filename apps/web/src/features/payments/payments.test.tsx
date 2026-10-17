import { verifiedIntent, authorizationFor } from "@/test/verification";
import { completeVerification } from "@/test/verification-ui";
import { demoTransactions } from "@/mocks/data/demo-profile";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { TransferService } from "@/mocks/bank/transfer-service";
import { createIntent } from "@/lib/api/payments";
import { NewTransfer } from "./new-transfer";
import { TransferReview } from "./transfer-review";
import { TransferReceiptPage } from "./transfer-receipt";
import { PaymentsHub } from "./payments-hub";
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
const request = {
  sourceAccountId: "acc_current",
  recipientId: "recipient_zhang",
  amount: { amount: "500.00", currency: "CNY" as const },
  note: "Family expenses",
};
async function fill(amount = "500") {
  await screen.findByRole("option", { name: /CNY Current/ });
  await userEvent.selectOptions(
    screen.getByLabelText("Source account"),
    "acc_current",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Recipient"),
    "recipient_zhang",
  );
  await userEvent.type(screen.getByLabelText("Amount (CNY)"), amount);
}
it("uses RHF/Zod validation and only prepares an intent after valid input", async () => {
  mount(<NewTransfer />);
  await screen.findByRole("button", { name: "Review transfer" });
  await userEvent.click(
    screen.getByRole("button", { name: "Review transfer" }),
  );
  expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(3);
  expect(Object.keys(bankingStore.read().intents)).toHaveLength(0);
  await fill("0");
  await userEvent.click(
    screen.getByRole("button", { name: "Review transfer" }),
  );
  expect(
    await screen.findByText("Amount must be greater than zero."),
  ).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Amount (CNY)"));
  await userEvent.type(screen.getByLabelText("Amount (CNY)"), "500");
  await userEvent.type(
    screen.getByLabelText("Note (optional)"),
    "Family expenses",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review transfer" }),
  );
  await waitFor(() =>
    expect(nav.push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/app\/payments\/transfers\/review\/intent_/),
    ),
  );
  expect(bankingStore.account("acc_current")?.balance.amount).toBe("23842.31");
  expect(bankingStore.read().transactions).toHaveLength(
    demoTransactions.length,
  );
  expect(Object.values(bankingStore.read().intents)[0].amount.amount).toBe(
    "500.00",
  );
});
it("rejects currency mismatch before prepare and displays API failures with resubmission", async () => {
  mount(<NewTransfer />);
  await fill();
  await userEvent.selectOptions(
    screen.getByLabelText("Source account"),
    "acc_usd",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review transfer" }),
  );
  expect(await screen.findByText(/Choose a CNY account/)).toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByLabelText(/Source account/),
    "acc_current",
  );
  server.use(
    http.post(
      "/customer/transfer-intents",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review transfer" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "API request failed",
  );
  server.resetHandlers();
  await userEvent.click(
    screen.getByRole("button", { name: "Review transfer" }),
  );
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
});
it("reviews exact API terms, sends only the intent reference and prevents duplicate clicks", async () => {
  const intent = await verifiedIntent(createIntent(request));
  let calls = 0;
  const service = new TransferService(bankingStore);
  server.use(
    http.post("/customer/transfers", async ({ request: incoming }) => {
      calls++;
      const body = await incoming.json();
      expect(body).toEqual({
        actionAuthorizationId: expect.any(String),
        intentId: intent.id,
        intentHash: intent.intentHash,
      });
      expect(incoming.headers.get("Idempotency-Key")).toBe(
        `confirm_${intent.id}`,
      );
      await delay(300);
      return HttpResponse.json(
        service.execute(body, incoming.headers.get("Idempotency-Key")),
      );
    }),
  );
  const client = mount(<TransferReview intentId={intent.id} />);
  client.setQueryDefaults(["accounts"], { gcTime: Infinity });
  client.setQueryData(["accounts"], { old: true });
  client.setQueryData(["transactions", {}], { old: true });
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading transfer review",
  );
  expect(await screen.findByText("¥23,310.31")).toBeInTheDocument();
  expect(screen.getByText("Family expenses")).toBeInTheDocument();
  expect(screen.getByText("Zhang San · •••• 6018")).toBeInTheDocument();
  expect(screen.getByText("¥0.00")).toBeInTheDocument();
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Confirm transfer" }),
  );
  await completeVerification();
  expect(
    screen.getByRole("button", { name: "Retry confirmation" }),
  ).toBeDisabled();
  await waitFor(() =>
    expect(nav.replace).toHaveBeenCalledWith(
      "/app/payments/transfers/transfer_1",
    ),
  );
  expect(calls).toBe(1);
  expect(client.getQueryData(["transactions", {}])).toBeUndefined();
  expect(client.getQueryState(["accounts"])?.isInvalidated).toBe(true);
});
it("retries an uncertain execution outcome with the same key without a second debit", async () => {
  const intent = await verifiedIntent(createIntent(request));
  const keys: string[] = [];
  const service = new TransferService(bankingStore);
  server.use(
    http.post("/customer/transfers", async ({ request: incoming }) => {
      const key = incoming.headers.get("Idempotency-Key")!;
      keys.push(key);
      const receipt = service.execute(await incoming.json(), key);
      if (keys.length === 1) return HttpResponse.error();
      return HttpResponse.json(receipt);
    }),
  );
  mount(<TransferReview intentId={intent.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm transfer" }),
  );
  await completeVerification();
  expect(await screen.findByRole("alert")).toHaveTextContent("Transfer failed");
  await userEvent.click(
    screen.getByRole("button", { name: "Retry confirmation" }),
  );
  await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  expect(keys[0]).toBe(keys[1]);
  expect(bankingStore.read().transactions).toHaveLength(
    demoTransactions.length + 1,
  );
  expect(bankingStore.account("acc_current")?.balance.amount).toBe("23342.31");
});
it("shows failed execute validation without mutation", async () => {
  const intent = await verifiedIntent(createIntent(request));
  bankingStore.clock.advance(15 * 60 * 1000);
  mount(<TransferReview intentId={intent.id} />);
  expect(await screen.findByText(/This intent is expired/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Confirm transfer" }),
  ).toBeDisabled();
  expect(bankingStore.read().transactions).toHaveLength(
    demoTransactions.length,
  );
});
it("loads a completed receipt and links the domain transaction", async () => {
  const service = new TransferService(bankingStore);
  const intent = await verifiedIntent(service.prepare(request));
  const receipt = service.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "receipt",
  );
  mount(<TransferReceiptPage transferId={receipt.id} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading transfer receipt",
  );
  expect(
    await screen.findByRole("heading", { name: "Transfer completed" }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("receipt-amount")).toHaveTextContent("¥500.00");
  expect(
    screen.getByRole("link", { name: "View transaction" }),
  ).toHaveAttribute("href", `/app/transactions/${receipt.transactionId}`);
});
it.each(["review", "receipt"])(
  "renders %s 404 and API error/retry",
  async (kind) => {
    const path =
      kind === "review"
        ? "/customer/transfer-intents/missing"
        : "/customer/transfers/missing";
    server.use(http.get(path, () => new HttpResponse(null, { status: 500 })));
    mount(
      kind === "review" ? (
        <TransferReview intentId="missing" />
      ) : (
        <TransferReceiptPage transferId="missing" />
      ),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    server.resetHandlers();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", { name: "Transfer not found" }),
    ).toBeInTheDocument();
  },
);
it("loads hub recipients and API-backed recent transfers; searches and retries recipients", async () => {
  mount(<PaymentsHub />);
  expect(await screen.findByText("Zhang San")).toBeInTheDocument();
  expect(await screen.findAllByText("From Jamie Lee")).toHaveLength(3);
  await userEvent.type(screen.getByLabelText("Search recipients"), "Mom");
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(screen.queryByText("Zhang San")).not.toBeInTheDocument(),
  );
  expect(screen.getByText("Mom")).toBeInTheDocument();
  cleanup();
  server.use(
    http.get(
      "/customer/recipients",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<PaymentsHub />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Zhang San")).toBeInTheDocument();
});
it("retries loading transfer options without losing the form", async () => {
  server.use(
    http.get(
      "/customer/accounts",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<NewTransfer />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("button", { name: "Review transfer" }),
  ).toBeInTheDocument();
});
