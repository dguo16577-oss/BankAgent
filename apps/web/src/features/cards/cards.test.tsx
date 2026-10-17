import { completeVerification } from "@/test/verification-ui";
import { verifiedIntent, authorizationFor } from "@/test/verification";
import { beforeEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { CardService } from "@/mocks/bank/card-service";
import { prepareCardAction, executeCardAction } from "@/lib/api/cards";
import { CardsList } from "./cards-list";
import { CardDetailPage } from "./card-detail";
import { CardActionReview } from "./card-action-review";
import { CardActionReceiptPage } from "./card-action-receipt";
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const id = "card_aster_debit";
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
it("loads two masked card visuals with statuses and linked accounts", async () => {
  mount(<CardsList />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading cards");
  expect(await screen.findByText("••8821")).toBeInTheDocument();
  expect(screen.getByText("••1937")).toBeInTheDocument();
  expect(
    screen.getAllByTestId("card-status").map((el) => el.textContent),
  ).toEqual(["ACTIVE", "ACTIVE"]);
  expect(screen.getByRole("link", { name: /Visa Debit/ })).toHaveAttribute(
    "href",
    `/app/cards/${id}`,
  );
  expect(screen.getAllByText(/Linked account · CNY Current/)).toHaveLength(2);
});
it("renders an empty card list and retries a failed list query", async () => {
  server.use(
    http.get("/customer/cards", () => HttpResponse.json({ items: [] })),
  );
  mount(<CardsList />);
  expect(await screen.findByText("No cards to display.")).toBeInTheDocument();
  cleanup();
  server.use(
    http.get("/customer/cards", () => new HttpResponse(null, { status: 500 })),
  );
  mount(<CardsList />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("••8821")).toBeInTheDocument();
});
it("loads detail and only its API-filtered recent activity", async () => {
  mount(<CardDetailPage cardId={id} />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading card");
  expect(
    await screen.findByRole("heading", { name: "Visa Debit" }),
  ).toBeInTheDocument();
  expect(await screen.findAllByTestId("card-transaction")).toHaveLength(5);
  expect(screen.getByText("Starbucks")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "View all card activity" }),
  ).toHaveAttribute("href", `/app/transactions?cardId=${id}`);
  expect(screen.getByRole("switch", { name: "Online payments" })).toBeChecked();
  expect(screen.getByRole("link", { name: "CNY Current" })).toHaveAttribute(
    "href",
    "/app/accounts/acc_current",
  );
});
it("handles empty activity and card detail errors with retry", async () => {
  mount(<CardDetailPage cardId="card_aster_credit" />);
  expect(
    await screen.findByText("No card transactions found."),
  ).toBeInTheDocument();
  cleanup();
  server.use(
    http.get(
      `/customer/cards/${id}`,
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<CardDetailPage cardId={id} />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("heading", { name: "Visa Debit" }),
  ).toBeInTheDocument();
});
it("keeps controls local until preparation and never optimistically mutates saved state", async () => {
  mount(<CardDetailPage cardId={id} />);
  const control = await screen.findByRole("switch", {
    name: "Online payments",
  });
  await userEvent.click(control);
  expect(control).not.toBeChecked();
  expect(new CardService(bankingStore).card(id).controls.onlinePayments).toBe(
    true,
  );
  expect(screen.getAllByText("Saved: ON")).toHaveLength(4);
  expect(Object.keys(bankingStore.read().cardIntents)).toHaveLength(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Review control changes" }),
  );
  await waitFor(() =>
    expect(nav.push).toHaveBeenCalledWith(
      expect.stringMatching(/\/actions\/review\/card_intent_/),
    ),
  );
  const intent = Object.values(bankingStore.read().cardIntents)[0];
  expect(intent.before.controls.onlinePayments).toBe(true);
  expect(intent.after.controls.onlinePayments).toBe(false);
  expect(new CardService(bankingStore).card(id).controls.onlinePayments).toBe(
    true,
  );
});
it("prepares freeze without mutation and recovers from prepare errors", async () => {
  server.use(
    http.post(
      "/customer/card-action-intents",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<CardDetailPage cardId={id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Freeze card" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "API request failed",
  );
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Freeze card" }));
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
  expect(new CardService(bankingStore).card(id).status).toBe("ACTIVE");
});
it("shows exact freeze before/after and only sends intent/hash with a stable key", async () => {
  const intent = await verifiedIntent(
    prepareCardAction({ cardId: id, actionType: "FREEZE" }),
  );
  let calls = 0;
  const service = new CardService(bankingStore);
  server.use(
    http.post("/customer/card-actions", async ({ request }) => {
      calls++;
      const body = await request.json();
      expect(body).toEqual({
        actionAuthorizationId: authorizationFor(intent),
        intentId: intent.id,
        intentHash: intent.intentHash,
      });
      expect(request.headers.get("Idempotency-Key")).toBe(
        `confirm_${intent.id}`,
      );
      await delay(250);
      return HttpResponse.json(
        service.execute(body, request.headers.get("Idempotency-Key")),
      );
    }),
  );
  const client = mount(<CardActionReview cardId={id} intentId={intent.id} />);
  client.setQueryDefaults(["overview"], { gcTime: Infinity });
  client.setQueryData(["overview"], { old: true });
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading card action review",
  );
  expect(await screen.findByTestId("risk-direction")).toHaveTextContent(
    "PROTECTIVE",
  );
  const row = screen.getAllByTestId("card-change")[0];
  expect(within(row).getByText("ACTIVE")).toBeInTheDocument();
  expect(within(row).getByText("FROZEN")).toBeInTheDocument();
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Confirm card action" }),
  );
  expect(screen.getByRole("button", { name: "Processing…" })).toBeDisabled();
  await waitFor(() =>
    expect(nav.replace).toHaveBeenCalledWith(
      `/app/cards/${id}/actions/card_action_1`,
    ),
  );
  expect(calls).toBe(1);
  expect(client.getQueryState(["overview"])?.isInvalidated).toBe(true);
});
it("shows exact protective control change and executes it", async () => {
  const service = new CardService(bankingStore);
  const intent = await verifiedIntent(
    service.prepare({
      cardId: id,
      actionType: "UPDATE_CONTROLS",
      controls: { ...service.card(id).controls, onlinePayments: false },
    }),
  );
  mount(<CardActionReview cardId={id} intentId={intent.id} />);
  const rows = await screen.findAllByTestId("card-change");
  const row = rows.find((el) => el.textContent?.includes("Online payments"))!;
  expect(within(row).getByText("ON")).toBeInTheDocument();
  expect(within(row).getByText("OFF")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm card action" }),
  );
  await completeVerification();
  await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  expect(service.card(id).controls.onlinePayments).toBe(false);
});
it.each(["UNFREEZE", "UPDATE_CONTROLS"] as const)(
  "blocks risk-increasing %s with no execute request",
  async (actionType) => {
    const service = new CardService(bankingStore);
    let intent;
    if (actionType === "UNFREEZE") {
      const freeze = await verifiedIntent(
        service.prepare({
          cardId: id,
          actionType: "FREEZE",
        }),
      );
      service.execute(
        {
          actionAuthorizationId: authorizationFor(freeze),
          intentId: freeze.id,
          intentHash: freeze.intentHash,
        },
        "freeze",
      );
      intent = await verifiedIntent(
        service.prepare({ cardId: id, actionType }),
      );
    } else {
      const controls = service.card(id).controls;
      const off = await verifiedIntent(
        service.prepare({
          cardId: id,
          actionType,
          controls: { ...controls, onlinePayments: false },
        }),
      );
      service.execute(
        {
          actionAuthorizationId: authorizationFor(off),
          intentId: off.id,
          intentHash: off.intentHash,
        },
        "off",
      );
      intent = await verifiedIntent(
        service.prepare({ cardId: id, actionType, controls }),
      );
    }
    let calls = 0;
    server.use(
      http.post("/customer/card-actions", () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    mount(<CardActionReview cardId={id} intentId={intent.id} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Confirm card action" }),
    );
    expect(await screen.findByLabelText("Account password")).toBeVisible();
    expect(screen.getByLabelText("SMS verification code")).toBeVisible();
    expect(screen.getByTestId("risk-direction")).toHaveTextContent(
      "RISK_INCREASING",
    );
    expect(
      screen.getByRole("button", { name: "Verify and continue" }),
    ).toBeDisabled();
    expect(calls).toBe(0);
  },
);
it("retries uncertain execution with the same key and does not repeat a card mutation", async () => {
  const intent = await verifiedIntent(
    prepareCardAction({ cardId: id, actionType: "FREEZE" }),
  );
  const keys: string[] = [];
  const service = new CardService(bankingStore);
  server.use(
    http.post("/customer/card-actions", async ({ request }) => {
      const key = request.headers.get("Idempotency-Key")!;
      keys.push(key);
      const receipt = service.execute(await request.json(), key);
      return keys.length === 1
        ? HttpResponse.error()
        : HttpResponse.json(receipt);
    }),
  );
  mount(<CardActionReview cardId={id} intentId={intent.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm card action" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Action failed");
  await userEvent.click(
    screen.getByRole("button", { name: "Retry confirmation" }),
  );
  await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  expect(keys[0]).toBe(keys[1]);
  expect(service.card(id).version).toBe(1);
});
it("shows stale-state errors and expired review without executing", async () => {
  const intent = await verifiedIntent(
    prepareCardAction({ cardId: id, actionType: "FREEZE" }),
  );
  const state = bankingStore.read();
  state.cards[0].version++;
  bankingStore.commit(state);
  mount(<CardActionReview cardId={id} intentId={intent.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm card action" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Card state changed",
  );
  expect(
    screen.getByRole("button", { name: "Retry confirmation" }),
  ).toBeDisabled();
  expect(new CardService(bankingStore).card(id).status).toBe("ACTIVE");
  cleanup();
  bankingStore.clock.advance(15 * 60 * 1000);
  mount(<CardActionReview cardId={id} intentId={intent.id} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("expired");
  expect(
    screen.getByRole("button", { name: "Confirm card action" }),
  ).toBeDisabled();
});
it("renders a receipt and returns to the current card", async () => {
  const intent = await verifiedIntent(
    prepareCardAction({ cardId: id, actionType: "FREEZE" }),
  );
  const receipt = await executeCardAction(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "receipt",
  );
  mount(<CardActionReceiptPage cardId={id} actionId={receipt.id} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading card action receipt",
  );
  expect(
    await screen.findByRole("heading", { name: "Card action completed" }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("card-status")).toHaveTextContent("FROZEN");
  expect(screen.getByRole("link", { name: "View card" })).toHaveAttribute(
    "href",
    `/app/cards/${id}`,
  );
});
it.each(["card", "intent", "action"])(
  "renders %s 404 and retries API errors",
  async (resource) => {
    const path =
      resource === "card"
        ? "/customer/cards/missing"
        : resource === "intent"
          ? "/customer/card-action-intents/missing"
          : "/customer/card-actions/missing";
    server.use(http.get(path, () => new HttpResponse(null, { status: 500 })));
    mount(
      resource === "card" ? (
        <CardDetailPage cardId="missing" />
      ) : resource === "intent" ? (
        <CardActionReview cardId={id} intentId="missing" />
      ) : (
        <CardActionReceiptPage cardId={id} actionId="missing" />
      ),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    server.resetHandlers();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", {
        name: resource === "card" ? "Card not found" : "Card action not found",
      }),
    ).toBeInTheDocument();
  },
);
it("rejects a review nested beneath a different card", async () => {
  const intent = await verifiedIntent(
    prepareCardAction({ cardId: id, actionType: "FREEZE" }),
  );
  mount(<CardActionReview cardId="card_aster_credit" intentId={intent.id} />);
  expect(
    await screen.findByRole("heading", { name: "Card action not found" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Confirm card action" }),
  ).not.toBeInTheDocument();
});
