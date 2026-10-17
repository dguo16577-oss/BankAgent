import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "@/mocks/server";
import { getDemoOverview } from "@/mocks/data/demo-profile";
import { OverviewDashboard } from "./overview-dashboard";

function renderOverview() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <OverviewDashboard />
    </QueryClientProvider>,
  );
}

it("loads the API-backed financial dashboard and all summary sections", async () => {
  renderOverview();
  expect(
    screen.getByRole("status", { name: "Loading overview" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("Hello, Alex Chen")).toBeInTheDocument();
  expect(screen.getByTestId("total-balance")).toHaveTextContent("¥36,453.68");
  expect(screen.getByText("CNY equivalent (estimated)")).toBeInTheDocument();
  expect(screen.getByText(/DEMO_RATE/)).toHaveTextContent(
    "27 Sept 2026, 10:00",
  );
  expect(screen.getByText(/Current MTD:/)).toHaveTextContent(
    "1 Sept 2026, 00:00 — 27 Sept 2026, 10:30",
  );
  expect(screen.getByText(/Current MTD:/)).toHaveTextContent(
    "1 Aug 2026, 00:00 — 27 Aug 2026, 10:30",
  );
  const accounts = within(screen.getByRole("region", { name: "Accounts" }));
  for (const value of [
    "CNY Current",
    "¥23,842.31",
    "Savings",
    "¥8,200.00",
    "USD",
    "$621.32",
  ])
    expect(accounts.getAllByText(value).length).toBeGreaterThan(0);
  const transactions = within(
    screen.getByRole("region", { name: "Recent transactions" }),
  );
  expect(transactions.getAllByRole("listitem")).toHaveLength(5);
  for (const value of [
    "Starbucks",
    "Pending",
    "Fresh Market",
    "−¥186.50",
    "Monthly salary",
    "+¥12,000.00",
  ])
    expect(transactions.getByText(value)).toBeInTheDocument();
  const cards = within(screen.getByRole("region", { name: "Your cards" }));
  for (const value of ["Visa Debit", "Mastercard Credit", "••8821", "••1937"])
    expect(cards.getByText(value)).toBeInTheDocument();
  expect(cards.getAllByText("Active")).toHaveLength(2);
  const payments = within(
    screen.getByRole("region", { name: "Upcoming payments" }),
  );
  for (const value of ["Rent", "Netflix", "Credit card bill", "¥1,286.40"])
    expect(payments.getByText(value)).toBeInTheDocument();
  const wealth = within(screen.getByRole("region", { name: "Wealth" }));
  for (const value of [
    "¥18,320.00",
    "Money Market",
    "Bond Fund",
    "Cash Management",
    "3 holdings",
  ])
    expect(wealth.getByText(value)).toBeInTheDocument();
  expect(wealth.getByText(/\+¥220.00.*1.22%/)).toBeInTheDocument();
  expect(screen.getByText("¥4,968.00")).toBeInTheDocument();
  expect(
    screen.getByText(/3.50% vs previous-month same-day range/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByText("View monthly amounts"));
  expect(screen.getByText("Apr: ¥4,620.00")).toBeVisible();
  expect(screen.getByText("Sep: ¥4,968.00")).toBeVisible();
  expect(screen.getByRole("link", { name: "Transfer" })).toHaveAttribute(
    "href",
    "/app/payments/transfers/new",
  );
  expect(screen.getByRole("button", { name: /Add money/ })).toBeDisabled();
});

it("shows an API error and retries through the same endpoint", async () => {
  server.use(
    http.get(
      "/customer/overview",
      () => new HttpResponse(null, { status: 503 }),
    ),
  );
  renderOverview();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We couldn’t load your overview",
  );
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry overview" }));
  expect(await screen.findByTestId("total-balance")).toHaveTextContent(
    "¥36,453.68",
  );
});

it("keeps loading visible until the overview response arrives", async () => {
  server.use(
    http.get("/customer/overview", async () => {
      await delay(100);
      return HttpResponse.json(getDemoOverview());
    }),
  );
  renderOverview();
  expect(
    screen.getByRole("status", { name: "Loading overview" }),
  ).toBeInTheDocument();
  expect(screen.queryByTestId("total-balance")).not.toBeInTheDocument();
  await screen.findByTestId("total-balance");
});

it("renders an empty overview with omitted optional sections", async () => {
  const data = getDemoOverview();
  server.use(
    http.get("/customer/overview", () =>
      HttpResponse.json({
        asOf: data.asOf,
        baseCurrency: data.baseCurrency,
        user: data.user,
        totalBalance: { amount: "0.00", currency: "CNY" },
      }),
    ),
  );
  renderOverview();
  expect(await screen.findByTestId("total-balance")).toHaveTextContent("¥0.00");
  expect(screen.getByRole("status")).toHaveTextContent("No financial activity");
  for (const text of [
    "No accounts to display.",
    "No spending summary available.",
    "No recent transactions.",
    "No cards to display.",
    "No upcoming payments.",
    "No wealth summary available.",
  ])
    expect(screen.getByText(text)).toBeInTheDocument();
});

it("handles empty collections, unavailable comparisons and completed transaction status", async () => {
  const data = getDemoOverview();
  if (!data.spending || !data.wealth || !data.recentTransactions)
    throw new Error("Incomplete fixture");
  data.spending.trend = [];
  data.spending.changePercent = null;
  data.wealth.holdings = [];
  data.wealth.monthlyChangePercent = null;
  data.accounts = [];
  data.cards = [];
  data.upcomingPayments = [];
  data.recentTransactions[0].status = "COMPLETED";
  server.use(http.get("/customer/overview", () => HttpResponse.json(data)));
  renderOverview();
  await screen.findByTestId("total-balance");
  expect(
    screen.getByText("No spending history available."),
  ).toBeInTheDocument();
  expect(screen.getByText("No comparison available")).toBeInTheDocument();
  expect(screen.getByText("No holdings available.")).toBeInTheDocument();
  expect(screen.getByText("Starbucks")).toBeInTheDocument();
  expect(screen.queryByText("Pending")).not.toBeInTheDocument();
});
