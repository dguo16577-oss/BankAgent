import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "@/mocks/server";
import { getDemoAccount, getDemoAccounts } from "@/mocks/data/demo-profile";
import { AccountsList } from "./accounts-list";
import { AccountDetailPage } from "./account-detail";

function mount(content: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
}

it("loads accounts with original amounts, available balances, status, masks and estimates", async () => {
  mount(<AccountsList />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading accounts");
  expect(await screen.findByTestId("accounts-total")).toHaveTextContent(
    "¥36,453.68",
  );
  const list = within(screen.getByRole("region", { name: "Your accounts" }));
  expect(list.getAllByRole("link")).toHaveLength(3);
  const current = within(
    list.getByRole("link", { name: "View CNY Current account" }),
  );
  for (const text of ["¥23,842.31", "¥23,810.31", "Active"])
    expect(current.getByText(text)).toBeInTheDocument();
  expect(current.getByText(/•••• 1048/)).toBeInTheDocument();
  expect(
    list.getByRole("link", { name: "View CNY Current account" }),
  ).toHaveAttribute("href", "/app/accounts/acc_current");
  const usd = within(list.getByRole("link", { name: "View USD account" }));
  expect(usd.getAllByText("$621.32")).toHaveLength(2);
  expect(usd.getByText("¥4,411.37")).toBeInTheDocument();
  expect(usd.getByText("Estimated CNY equivalent")).toBeInTheDocument();
  expect(screen.getByText(/1 USD = 7.10 CNY · DEMO_RATE/)).toHaveTextContent(
    "27 Sept 2026, 10:00",
  );
});

it("shows a genuine empty list", async () => {
  server.use(
    http.get("/customer/accounts", () =>
      HttpResponse.json({
        ...getDemoAccounts(),
        accounts: [],
        exchangeEquivalents: [],
        totalBalance: { amount: "0.00", currency: "CNY" },
      }),
    ),
  );
  mount(<AccountsList />);
  expect(await screen.findByText("No accounts yet")).toBeInTheDocument();
  expect(screen.getByTestId("accounts-total")).toHaveTextContent("¥0.00");
});

it("loads account detail with its own transactions and navigation-only transfer", async () => {
  mount(<AccountDetailPage accountId="acc_current" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading account");
  expect(
    await screen.findByRole("heading", { name: "CNY Current" }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("account-balance")).toHaveTextContent("¥23,842.31");
  expect(screen.getByTestId("available-balance")).toHaveTextContent(
    "¥23,810.31",
  );
  expect(screen.getByText("¥32.00")).toBeInTheDocument();
  expect(screen.getByText("Active")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Transfer" })).toHaveAttribute(
    "href",
    "/app/payments/transfers/new",
  );
  expect(
    screen.getByRole("link", { name: "Back to Accounts" }),
  ).toHaveAttribute("href", "/app/accounts");
  const transactions = within(
    screen.getByRole("region", { name: "Recent transactions" }),
  );
  expect(transactions.getAllByRole("listitem")).toHaveLength(5);
  for (const text of [
    "Starbucks",
    "Pending",
    "Fresh Market",
    "Monthly salary",
    "+¥12,000.00",
  ])
    expect(transactions.getByText(text)).toBeInTheDocument();
});

it("shows foreign-currency provenance and an empty account transaction section", async () => {
  const fixture = getDemoAccount("acc_usd")!;
  fixture.recentTransactions = [];
  server.use(
    http.get("/customer/accounts/acc_usd", () => HttpResponse.json(fixture)),
  );
  mount(<AccountDetailPage accountId="acc_usd" />);
  expect(await screen.findByTestId("account-balance")).toHaveTextContent(
    "$621.32",
  );
  expect(screen.getByText("¥4,411.37")).toBeInTheDocument();
  expect(screen.getByText(/DEMO_RATE/)).toBeInTheDocument();
  expect(
    screen.getByText("No recent transactions for this account."),
  ).toBeInTheDocument();
  expect(screen.queryByText("Monthly salary")).not.toBeInTheDocument();
});

it.each(["RESTRICTED", "FROZEN", "CLOSED"] as const)(
  "displays %s status without inventing available funds",
  async (status) => {
    const data = getDemoAccount("acc_savings")!;
    data.status = status;
    delete data.openedAt;
    delete data.pendingAmount;
    server.use(
      http.get("/customer/accounts/acc_savings", () => HttpResponse.json(data)),
    );
    mount(<AccountDetailPage accountId="acc_savings" />);
    await screen.findByTestId("account-balance");
    expect(
      screen.getByText(status[0] + status.slice(1).toLowerCase()),
    ).toBeInTheDocument();
    expect(screen.getByText("Not applicable")).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
  },
);

it.each(["list", "detail"])(
  "handles %s API errors and retries",
  async (view) => {
    const url =
      view === "list" ? "/customer/accounts" : "/customer/accounts/acc_current";
    server.use(
      http.get(url, () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", message: "Temporarily unavailable." },
          { status: 500 },
        ),
      ),
    );
    mount(
      view === "list" ? (
        <AccountsList />
      ) : (
        <AccountDetailPage accountId="acc_current" />
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load account information",
    );
    server.resetHandlers();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByTestId(
        view === "list" ? "accounts-total" : "account-balance",
      ),
    ).toBeInTheDocument();
  },
);

it("presents unknown IDs as not found, not as a generic failure", async () => {
  mount(<AccountDetailPage accountId="missing-account" />);
  expect(
    await screen.findByRole("heading", { name: "Account not found" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Retry" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Back to Accounts" }),
  ).toBeInTheDocument();
});
