import { useSyncExternalStore } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/mocks/server";
import { queryDemoTransactions } from "@/mocks/data/transaction-query";
import { TransactionsList } from "./transactions-list";
import { TransactionDetailPage } from "./transaction-detail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (url: string) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
  }),
  useSearchParams: () => {
    const search = useSyncExternalStore(
      (listener) => {
        window.addEventListener("popstate", listener);
        return () => window.removeEventListener("popstate", listener);
      },
      () => window.location.search,
    );
    return new URLSearchParams(search);
  },
}));
beforeEach(() => window.history.replaceState({}, "", "/app/transactions"));
function mount(children: React.ReactNode = <TransactionsList />) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

it("loads default transactions, presents debit/credit and loads another cursor page", async () => {
  mount();
  expect(screen.getByRole("status")).toHaveTextContent("Loading transactions");
  expect(await screen.findAllByTestId("transaction-row")).toHaveLength(10);
  expect(screen.getByText("−¥32.00")).toBeInTheDocument();
  expect(screen.getByText("+¥12,000.00")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(screen.getAllByTestId("transaction-row")).toHaveLength(20),
  );
  expect(
    new Set(
      screen
        .getAllByTestId("transaction-row")
        .map((row) => row.getAttribute("href")),
    ).size,
  ).toBe(20);
});

it.each([
  ["Account", "acc_usd", "accountId"],
  ["Status", "PENDING", "status"],
  ["Type", "BANK_TRANSFER", "type"],
  ["Category", "DINING", "category"],
  ["Direction", "CREDIT", "direction"],
])("sends the %s filter to the API and URL", async (label, value, key) => {
  const seen: string[] = [];
  server.use(
    http.get("/customer/transactions", ({ request }) => {
      seen.push(request.url);
      return HttpResponse.json(
        queryDemoTransactions(new URL(request.url).searchParams),
      );
    }),
  );
  mount();
  await screen.findAllByTestId("transaction-row");
  if (label === "Account") await screen.findByRole("option", { name: "USD" });
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: label }),
    value,
  );
  await waitFor(() =>
    expect(
      seen.some((url) => new URL(url).searchParams.get(key) === value),
    ).toBe(true),
  );
  await screen.findAllByTestId("transaction-row");
  expect(new URLSearchParams(window.location.search).get(key)).toBe(value);
  expect(screen.getByLabelText("Active filters")).toHaveTextContent(label);
  const expected = queryDemoTransactions(
    new URLSearchParams({ [key]: value, limit: "10" }),
  );
  await waitFor(() =>
    expect(
      screen
        .getAllByTestId("transaction-row")
        .map((row) => row.getAttribute("href")),
    ).toEqual(expected.items.map((item) => `/app/transactions/${item.id}`)),
  );
});

it("restores date filters, converts an inclusive local day to API bounds, searches and clears", async () => {
  window.history.replaceState(
    {},
    "",
    "/app/transactions?from=2026-09-26&to=2026-09-26",
  );
  const seen: URLSearchParams[] = [];
  server.use(
    http.get("/customer/transactions", ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.push(params);
      return HttpResponse.json(queryDemoTransactions(params));
    }),
  );
  mount();
  expect(await screen.findAllByTestId("transaction-row")).toHaveLength(2);
  expect(seen[0].get("from")).toBe("2026-09-26T00:00:00+08:00");
  expect(seen[0].get("to")).toBe("2026-09-27T00:00:00+08:00");
  expect(screen.getByLabelText("From date")).toHaveValue("2026-09-26");
  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() =>
    expect(screen.getAllByTestId("transaction-row")).toHaveLength(10),
  );
  await userEvent.type(
    screen.getByRole("searchbox", { name: "Search" }),
    "Jamie",
  );
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(screen.getAllByTestId("transaction-row")).toHaveLength(3),
  );
  expect(new URLSearchParams(window.location.search).get("search")).toBe(
    "Jamie",
  );
  expect(screen.getAllByText("Counterparty: Jamie Lee")).toHaveLength(3);
  expect(seen.at(-1)?.get("search")).toBe("Jamie");
});

it("resets pagination when a filter changes and renders empty results", async () => {
  mount();
  await screen.findAllByTestId("transaction-row");
  await userEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(screen.getAllByTestId("transaction-row")).toHaveLength(20),
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Status" }),
    "PENDING",
  );
  await waitFor(() =>
    expect(screen.getAllByTestId("transaction-row")).toHaveLength(1),
  );
  expect(
    screen.queryByRole("button", { name: "Load more" }),
  ).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByRole("searchbox", { name: "Search" }),
    "no-match",
  );
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("No transactions found")).toBeInTheDocument();
});

it("keeps loading visible and handles API errors/retry", async () => {
  server.use(
    http.get("/customer/transactions", async () => {
      await delay(60);
      return HttpResponse.json(
        { code: "INTERNAL_ERROR", message: "Try again" },
        { status: 500 },
      );
    }),
  );
  mount();
  expect(screen.getByRole("status")).toHaveTextContent("Loading transactions");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Transactions could not be loaded",
  );
  server.resetHandlers();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry transactions" }),
  );
  expect(await screen.findAllByTestId("transaction-row")).toHaveLength(10);
});

it("preserves items on load-more error and retries the same cursor", async () => {
  mount();
  await screen.findAllByTestId("transaction-row");
  server.use(
    http.get(
      "/customer/transactions",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "More transactions could not be loaded",
  );
  expect(screen.getAllByTestId("transaction-row")).toHaveLength(10);
  server.resetHandlers();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry load more" }),
  );
  await waitFor(() =>
    expect(screen.getAllByTestId("transaction-row")).toHaveLength(20),
  );
});

it("shows invalid URL filters explicitly and allows recovery", async () => {
  window.history.replaceState({}, "", "/app/transactions?category=INVALID");
  mount();
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid category");
  await userEvent.click(
    within(screen.getByRole("alert")).getByRole("button", {
      name: "Clear filters",
    }),
  );
  expect(await screen.findAllByTestId("transaction-row")).toHaveLength(10);
});

it.each([
  ["txn_coffee", "Merchant", "−¥32.00"],
  ["txn_history_0_07", "Counterparty", "+¥150.00"],
])(
  "renders detail %s with distinct party fields and masks",
  async (id, party, amount) => {
    mount(<TransactionDetailPage transactionId={id} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading transaction");
    expect(await screen.findByTestId("transaction-amount")).toHaveTextContent(
      amount,
    );
    expect(screen.getByRole("heading", { name: party })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: party === "Merchant" ? "Counterparty" : "Merchant",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CNY Current" })).toHaveAttribute(
      "href",
      "/app/accounts/acc_current",
    );
    expect(screen.getByText("•••• 1048 · CNY")).toBeInTheDocument();
    if (party === "Merchant") {
      expect(screen.getByText("Not posted")).toBeInTheDocument();
      expect(screen.getByText("Card •••• 8821")).toBeInTheDocument();
    }
  },
);

it("handles transaction detail error, retry and not found", async () => {
  server.use(
    http.get(
      "/customer/transactions/txn_coffee",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(<TransactionDetailPage transactionId="txn_coffee" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Transaction could not be loaded",
  );
  server.resetHandlers();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry transaction" }),
  );
  expect(await screen.findByTestId("transaction-amount")).toHaveTextContent(
    "−¥32.00",
  );
});
it("has an independent 404 state", async () => {
  mount(<TransactionDetailPage transactionId="missing" />);
  expect(
    await screen.findByRole("heading", { name: "Transaction not found" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Back to Transactions" }),
  ).toBeInTheDocument();
});
