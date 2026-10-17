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
import { WealthService } from "@/mocks/bank/wealth-service";
import { WealthDashboard } from "./wealth-dashboard";
import { ProductCatalog } from "./product-catalog";
import { ProductDetail } from "./product-detail";
import { NewInvestment } from "./new-investment";
import { InvestmentReview } from "./investment-review";
import { InvestmentReceipt } from "./investment-receipt";
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
});
const service = new WealthService(bankingStore);
const prepare = () => {
  const check = service.createCheck({ productId: "product_bond" });
  return verifiedIntent(
    service.prepare({
      productId: "product_bond",
      sourceAccountId: "acc_current",
      amount: { amount: "1000.00", currency: "CNY" },
      suitabilityCheckId: check.id,
    }),
  );
};
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
it("loads the API-backed portfolio, positions, performance, risk profile and product catalog", async () => {
  mount(<WealthDashboard />);
  expect(screen.getByText("Loading portfolio…")).toBeInTheDocument();
  expect(await screen.findByTestId("portfolio-total")).toHaveTextContent(
    "¥18,320.00",
  );
  const positions = screen.getAllByTestId("portfolio-position");
  expect(positions).toHaveLength(3);
  expect(within(positions[1]).getByText("¥5,320.00")).toBeInTheDocument();
  expect(within(positions[1]).getByText("¥5,100.00")).toBeInTheDocument();
  expect(within(positions[1]).getByText("+¥220.00")).toBeInTheDocument();
  expect(
    await screen.findByText("Alex Chen · Demo profile"),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: /Aster Stable Bond/ }),
  ).toHaveAttribute("href", "/app/wealth/products/product_bond");
});
it("filters catalog through API, supports empty intersection and clears filters", async () => {
  mount(<ProductCatalog />);
  await screen.findByRole("link", { name: /Aster Stable Bond/ });
  await userEvent.selectOptions(
    screen.getByLabelText("Product type"),
    "BOND_FUND",
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: /Aster Cash Reserve/ }),
    ).not.toBeInTheDocument(),
  );
  await userEvent.selectOptions(screen.getByLabelText("Risk level"), "R3");
  expect(
    await screen.findByText("No products match these filters."),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(
    await screen.findByRole("link", { name: /Aster Cash Reserve/ }),
  ).toBeInTheDocument();
});
it("handles empty portfolio and retries portfolio errors without hiding the catalog", async () => {
  const empty = service.portfolio();
  empty.positions = [];
  empty.totalValue.amount = "0.00";
  server.use(
    http.get("/customer/wealth/portfolio", () => HttpResponse.json(empty)),
  );
  mount(<WealthDashboard />);
  expect(
    await screen.findByText("No investment positions yet."),
  ).toBeInTheDocument();
  cleanup();
  server.use(
    http.get(
      "/customer/wealth/portfolio",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<WealthDashboard />);
  await screen.findByRole("alert");
  expect(
    await screen.findByRole("link", { name: /Aster Stable Bond/ }),
  ).toBeInTheDocument();
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByTestId("portfolio-total")).toHaveTextContent(
    "¥18,320.00",
  );
});
it("retries catalog and missing risk profile is explicit", async () => {
  server.use(
    http.get(
      "/customer/wealth/products",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<ProductCatalog />);
  await screen.findByRole("alert");
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("link", { name: /Aster Stable Bond/ });
  cleanup();
  const state = bankingStore.read();
  state.riskProfile = null;
  bankingStore.commit(state);
  mount(<ProductDetail productId="product_bond" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Risk profile not found",
  );
  expect(
    screen.getByRole("button", { name: "Check suitability" }),
  ).toBeDisabled();
});
it("shows product details and service suitability before enabling Invest", async () => {
  mount(<ProductDetail productId="product_bond" />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Aster Stable Bond", level: 1 }),
  ).toBeInTheDocument();
  expect(screen.getByText("¥1,000.00")).toBeInTheDocument();
  expect(screen.getByText("¥0.00")).toBeInTheDocument();
  expect(screen.getByText(/SIMULATED PRODUCT/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Invest unavailable" }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Check suitability" }),
  );
  expect(await screen.findByTestId("suitability-result")).toHaveTextContent(
    /^SUITABLE$/,
  );
  expect(
    screen.getByRole("link", { name: "Invest" }).getAttribute("href"),
  ).toMatch(/\/invest\?suitabilityCheckId=/);
});
it("shows NOT_SUITABLE R3 result and never offers an executable Invest link", async () => {
  mount(<ProductDetail productId="product_balanced" />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Check suitability" }),
  );
  expect(await screen.findByTestId("suitability-result")).toHaveTextContent(
    "NOT_SUITABLE",
  );
  expect(screen.getByText(/Product risk exceeds/)).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Invest" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Invest unavailable" }),
  ).toBeDisabled();
  expect(bankingStore.read().investmentOrderIntents).toEqual({});
});
it("handles product 404 and retries failed suitability creation", async () => {
  mount(<ProductDetail productId="missing" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Investment product not found",
  );
  cleanup();
  server.use(
    http.post(
      "/customer/wealth/suitability-checks",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<ProductDetail productId="product_bond" />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Check suitability" }),
  );
  await screen.findByRole("alert");
  server.resetHandlers();
  await userEvent.click(
    screen.getByRole("button", { name: "Check suitability" }),
  );
  expect(await screen.findByTestId("suitability-result")).toHaveTextContent(
    /^SUITABLE$/,
  );
});
it("validates investment input, enforces API minimum, then prepares without moving funds", async () => {
  const check = service.createCheck({ productId: "product_bond" });
  mount(<NewInvestment productId="product_bond" checkId={check.id} />);
  await screen.findByLabelText("Amount (CNY)");
  await userEvent.click(
    screen.getByRole("button", { name: "Review investment" }),
  );
  expect(
    await screen.findByText("Choose a source account."),
  ).toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByLabelText("Source account"),
    "acc_current",
  );
  await userEvent.type(screen.getByLabelText("Amount (CNY)"), "999.99");
  await userEvent.click(
    screen.getByRole("button", { name: "Review investment" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "below this product's minimum",
  );
  await userEvent.clear(screen.getByLabelText("Amount (CNY)"));
  await userEvent.type(screen.getByLabelText("Amount (CNY)"), "1000");
  await userEvent.click(
    screen.getByRole("button", { name: "Review investment" }),
  );
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
  expect(nav.push.mock.calls[0][0]).toMatch(
    /\/app\/wealth\/orders\/review\/investment_intent_/,
  );
  expect(bankingStore.account("acc_current")?.balance.amount).toBe("23842.31");
  expect(service.portfolio().totalValue.amount).toBe("18320.00");
});
it("direct invest route still checks suitability and blocks an unsuitable product", async () => {
  mount(<NewInvestment productId="product_balanced" />);
  await screen.findByLabelText("Amount (CNY)");
  await userEvent.selectOptions(
    screen.getByLabelText("Source account"),
    "acc_current",
  );
  await userEvent.type(screen.getByLabelText("Amount (CNY)"), "1000");
  await userEvent.click(
    screen.getByRole("button", { name: "Check suitability and review" }),
  );
  expect(await screen.findByTestId("suitability-result")).toHaveTextContent(
    "NOT_SUITABLE",
  );
  expect(
    screen.getByRole("button", { name: "Review investment" }),
  ).toBeDisabled();
  expect(bankingStore.read().investmentOrderIntents).toEqual({});
  expect(nav.push).not.toHaveBeenCalled();
});
it("rejects expired suitability before creating a review and shows the recovery link", async () => {
  const check = service.createCheck({ productId: "product_bond" });
  bankingStore.clock.advance(1800000);
  mount(<NewInvestment productId="product_bond" checkId={check.id} />);
  await screen.findByLabelText("Amount (CNY)");
  await userEvent.selectOptions(
    screen.getByLabelText("Source account"),
    "acc_current",
  );
  await userEvent.type(screen.getByLabelText("Amount (CNY)"), "1000");
  await userEvent.click(
    screen.getByRole("button", { name: "Review investment" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Suitability evidence has expired",
  );
  expect(
    screen.getByRole("link", { name: /Back to product/ }),
  ).toBeInTheDocument();
  expect(bankingStore.read().investmentOrderIntents).toEqual({});
});
it("reviews exact saved financial and suitability terms, confirms once and invalidates affected caches", async () => {
  const intent = await prepare();
  server.use(
    http.post("/customer/investment-orders", async ({ request }) => {
      await delay(100);
      return HttpResponse.json(
        service.execute(
          await request.json(),
          request.headers.get("Idempotency-Key"),
        ),
      );
    }),
  );
  const client = mount(<InvestmentReview intentId={intent.id} />);
  for (const key of [
    "portfolio",
    "accounts",
    "overview",
    "spending",
    "cards",
    "transactions",
  ]) {
    client.setQueryDefaults([key], { gcTime: Infinity });
    client.setQueryData([key], {});
  }
  expect(
    await screen.findByTestId("investment-review-amount"),
  ).toHaveTextContent("¥1,000.00");
  expect(screen.getByText("¥22,810.31")).toBeInTheDocument();
  expect(screen.getByText("SUITABLE")).toBeInTheDocument();
  expect(screen.getByText(/CNY Current · •••• 1048/)).toBeInTheDocument();
  expect(screen.getByText(/SIMULATED PRODUCT/)).toBeInTheDocument();
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Confirm investment" }),
  );
  await completeVerification();
  await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  expect(Object.keys(bankingStore.read().investmentOrders)).toHaveLength(1);
  for (const key of ["portfolio", "accounts", "overview", "spending"])
    expect(client.getQueryState([key])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["cards"])?.isInvalidated).toBe(false);
  expect(client.getQueryData(["transactions"])).toBeUndefined();
});
it("keeps the same key when retrying an uncertain investment response", async () => {
  const intent = await prepare();
  let first = true;
  server.use(
    http.post("/customer/investment-orders", async ({ request }) => {
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
  mount(<InvestmentReview intentId={intent.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm investment" }),
  );
  await completeVerification();
  await screen.findByRole("alert");
  await userEvent.click(
    screen.getByRole("button", { name: "Retry confirmation" }),
  );
  await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  expect(Object.keys(bankingStore.read().investmentOrders)).toHaveLength(1);
  expect(service.portfolio().totalValue.amount).toBe("19320.00");
});
it("renders expired and stale intent errors without an executable retry", async () => {
  const intent = await prepare();
  bankingStore.clock.advance(900000);
  mount(<InvestmentReview intentId={intent.id} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("expired");
  expect(
    screen.getByRole("button", { name: "Confirm investment" }),
  ).toBeDisabled();
  cleanup();
  const fresh = await prepare();
  const state = bankingStore.read();
  state.products[1].version++;
  bankingStore.commit(state);
  mount(<InvestmentReview intentId={fresh.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm investment" }),
  );
  await completeVerification();
  expect(await screen.findByRole("alert")).toHaveTextContent("changed");
  expect(
    screen.getByRole("button", { name: "Retry confirmation" }),
  ).toBeDisabled();
});
it("loads persisted receipt with transaction and portfolio links and updated holding", async () => {
  const intent = await prepare();
  const receipt = service.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "receipt",
  );
  mount(<InvestmentReceipt orderId={receipt.id} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Investment completed" }),
  ).toBeInTheDocument();
  expect(screen.getByText("ASTER-INVEST-1")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "View investment transaction" }),
  ).toHaveAttribute("href", `/app/transactions/${receipt.transactionId}`);
  expect(screen.getByRole("link", { name: "View portfolio" })).toHaveAttribute(
    "href",
    "/app/wealth",
  );
  cleanup();
  mount(<WealthDashboard />);
  expect(await screen.findByTestId("portfolio-total")).toHaveTextContent(
    "¥19,320.00",
  );
  expect(screen.getByText("¥6,320.00")).toBeInTheDocument();
});
it("handles review/receipt 404 and retries receipt loading failures", async () => {
  mount(<InvestmentReview intentId="missing" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Investment intent not found",
  );
  cleanup();
  mount(<InvestmentReceipt orderId="missing" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Investment order not found",
  );
  cleanup();
  const intent = await prepare();
  const receipt = service.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    "load",
  );
  server.use(
    http.get(
      "/customer/investment-orders/:id",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<InvestmentReceipt orderId={receipt.id} />);
  await screen.findByRole("alert");
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("heading", { name: "Investment completed" }),
  ).toBeInTheDocument();
});
