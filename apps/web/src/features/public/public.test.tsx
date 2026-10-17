import { vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
import { beforeEach, expect, it } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { securityFixture } from "@/mocks/data/security-fixture";
import { login, logout } from "@/lib/api/security";
import { getPublicHome, getPublicNavigation } from "@/lib/api/public";
import { getCards } from "@/lib/api/cards";
import { PublicHomepage } from "./public-homepage";
import { PublicLayout } from "./public-layout";
import { PublicCategoryPage } from "./public-category";
import { ArticleDetail, ProductDetail } from "./catalog-pages";
beforeEach(() => bankingStore.reset());
function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
          },
        })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}
it("public home and navigation work without a session and do not mutate customer state", async () => {
  const before = bankingStore.read();
  const [home, nav] = await Promise.all([
    getPublicHome(),
    getPublicNavigation(),
  ]);
  expect(home.hero.title).toBe("Everyday banking, built around you.");
  expect(nav.groups.map((g) => g.label)).toContain("Cards & Borrowing");
  expect(bankingStore.read()).toEqual(before);
});
it("customer endpoint is rejected anonymously and succeeds after the same login semantics", async () => {
  await expect(getCards()).rejects.toMatchObject({
    status: 401,
    code: "UNAUTHENTICATED",
  });
  await login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  expect((await getCards()).items).toHaveLength(2);
  expect((await getPublicHome()).environment).toBe("DEMO");
});
it("public home remains accessible after session expiry and logout", async () => {
  await login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  bankingStore.clock.advance(60 * 60_000);
  await expect(getCards()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  expect((await getPublicHome()).featuredServices).toHaveLength(6);
  expect((await getPublicNavigation()).categories).toHaveLength(8);
  await login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  await logout();
  expect((await getPublicHome()).environment).toBe("DEMO");
});
it("public homepage stays anonymous while checking session for its customer entry", async () => {
  let sessions = 0;
  server.use(
    http.get("/customer/session", () => {
      sessions++;
      return HttpResponse.json({}, { status: 401 });
    }),
  );
  mount(
    <PublicLayout>
      <PublicHomepage />
    </PublicLayout>,
  );
  expect(
    await screen.findByRole("heading", {
      name: "Everyday banking, built around you.",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Featured services" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Stay alert to scams" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Explore Everyday Account" }),
  ).toHaveAttribute("href", "/products/everyday-account");
  expect(
    within(screen.getByRole("banner")).getByRole("link", {
      name: "Ask Aster",
    }),
  ).toHaveAttribute("href", "/app/agent");
  expect(
    screen.queryByRole("navigation", { name: "Main navigation" }),
  ).not.toBeInTheDocument();
  expect(sessions).toBe(1);
  expect(bankingStore.read().currentSessionId).toBeNull();
});
it("home error can be retried without authenticating", async () => {
  server.use(
    http.get("/public/home", () =>
      HttpResponse.json(
        { code: "PUBLIC_CONTENT_UNAVAILABLE", message: "Unavailable" },
        { status: 500 },
      ),
    ),
  );
  mount(<PublicHomepage />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("heading", {
      name: "Everyday banking, built around you.",
    }),
  ).toBeInTheDocument();
});
it("public home recovers automatically after a backend outage", async () => {
  server.use(
    http.get("/public/home", () =>
      HttpResponse.json(
        { code: "PUBLIC_CONTENT_UNAVAILABLE", message: "Unavailable" },
        { status: 503 },
      ),
    ),
  );
  mount(<PublicHomepage />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  server.resetHandlers();
  expect(
    await screen.findByRole(
      "heading",
      { name: "Everyday banking, built around you." },
      { timeout: 18_000 },
    ),
  ).toBeInTheDocument();
}, 20_000);
it("navigation opens grouped products and Escape restores focus", async () => {
  mount(
    <PublicLayout>
      <p>Public content</p>
    </PublicLayout>,
  );
  const nav = screen.getByRole("navigation", { name: "Public navigation" });
  const banking = await within(nav).findByRole("button", {
    name: "Banking",
  });
  await userEvent.click(banking);
  expect(banking).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: "Current Account" })).toHaveAttribute(
    "href",
    "/products/everyday-account",
  );
  expect(
    screen.getByRole("link", { name: "Foreign Exchange" }),
  ).toHaveAttribute("href", "/products/foreign-exchange");
  await userEvent.keyboard("{Escape}");
  expect(banking).toHaveAttribute("aria-expanded", "false");
  expect(banking).toHaveFocus();
});
it("narrow navigation provides accessible accordion links and closes after selection", async () => {
  mount(
    <PublicLayout>
      <p>Public content</p>
    </PublicLayout>,
  );
  await screen.findByRole("button", { name: "Banking" });
  await userEvent.click(
    screen.getByRole("button", { name: "Open navigation" }),
  );
  expect(
    within(
      screen.getByRole("navigation", { name: "Mobile public navigation" }),
    ).getByRole("link", { name: "Ask Aster" }),
  ).toHaveAttribute("href", "/app/agent");
  const nav = screen.getByRole("navigation", {
    name: "Mobile public navigation",
  });
  await userEvent.click(
    within(nav).getByText("Cards & Borrowing", { exact: true }),
  );
  const link = within(nav).getByRole("link", { name: "Personal Loan" });
  expect(link).toHaveAttribute("href", "/products/personal-loan");
  link.addEventListener("click", (event) => event.preventDefault());
  await userEvent.click(link);
  expect(
    screen.queryByRole("navigation", { name: "Mobile public navigation" }),
  ).not.toBeInTheDocument();
});
it("navigation error has a retry without affecting public content", async () => {
  server.use(
    http.get(
      "/public/navigation",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(
    <PublicLayout>
      <p>Public content</p>
    </PublicLayout>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Navigation");
  server.resetHandlers();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry navigation" }),
  );
  expect(
    await screen.findByRole("button", { name: "Banking" }),
  ).toBeInTheDocument();
});
it.each([
  ["banking", "Banking"],
  ["cards", "Cards"],
  ["borrowing", "Borrowing"],
  ["investments", "Investments"],
  ["insurance", "Insurance"],
  ["insights", "Insights"],
  ["offers", "Offers"],
  ["support", "Support"],
])(
  "public category %s has a title, sample services and navigation",
  async (route, title) => {
    mount(<PublicCategoryPage route={`/${route}`} />);
    expect(
      await screen.findByRole("heading", { name: title, level: 1 }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByRole("heading", { level: 3 })).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getByRole("link", { name: "Aster Bank home" }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(bankingStore.read().sessions).toEqual({});
  },
);
it("public cards and investments carry catalog information, never customer financial identifiers", async () => {
  const nav = await getPublicNavigation();
  const cards = nav.categories.find((c) => c.route === "/cards")!;
  const investments = nav.categories.find((c) => c.route === "/investments")!;
  expect(cards.description).toContain("not your personal cards");
  expect(investments.description).toContain(
    "separate from your personal portfolio",
  );
  const publicText = JSON.stringify([nav, await getPublicHome()]);
  expect(publicText).not.toMatch(
    /acc_current|card_aster_debit|23842\.31|usr_aster_alex/,
  );
});
it("all public catalog links stay on public discovery or login routes", async () => {
  const nav = await getPublicNavigation();
  const all = nav.groups
    .flatMap((g) => [
      g.route,
      ...g.sections.flatMap((s) => s.links.map((l) => l.route)),
    ])
    .concat(
      nav.categories.flatMap((c) => [
        c.route,
        ...c.services.map((s) => s.route),
      ]),
    );
  for (const route of all)
    expect(route).toMatch(
      /^\/(banking|cards|borrowing|investments|insurance|insights|offers|support|ask|login|products|rates|fees|payments-fx)(\/[^?#]+)?(#.*)?$/,
    );
  await waitFor(() =>
    expect(bankingStore.read().transactions.length).toBeGreaterThan(0),
  );
});
it("opens a time deposit from the product page and posts the demo debit", async () => {
  await login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  mount(<ProductDetail slug="time-deposit" />);
  expect(
    await screen.findByRole("heading", { name: "Time Deposit", level: 1 }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("button", { name: "Deposit now" }),
  ).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Deposit amount (CNY)"), "100.00");
  await userEvent.type(
    screen.getByLabelText("Confirm with your account password"),
    securityFixture.password,
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: /I understand this demo transfer/ }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Deposit now" }));
  expect(
    await screen.findByText("Deposit opened. View account →"),
  ).toBeInTheDocument();
  expect(bankingStore.read().timeDeposits).toHaveProperty(
    Object.keys(bankingStore.read().timeDeposits)[0],
  );
  expect(
    bankingStore.read().accounts.find((a) => a.id === "acc_current")?.balance
      .amount,
  ).not.toBe("23842.31");
  expect(
    screen.queryByRole("link", { name: "Apply now" }),
  ).not.toBeInTheDocument();
});
it("opens separate foreign-currency accounts on the product page", async () => {
  await login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  mount(<ProductDetail slug="global-currency-account" />);
  expect(
    await screen.findByRole("button", { name: "Open account" }),
  ).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Currency"), "JPY");
  await userEvent.click(screen.getByRole("button", { name: "Open account" }));
  expect(
    await screen.findByText("Account opened. View account →"),
  ).toBeInTheDocument();
  expect(
    bankingStore.read().accounts.some((account) => account.currency === "JPY"),
  ).toBe(true);
  await userEvent.selectOptions(screen.getByLabelText("Currency"), "EUR");
  await userEvent.click(screen.getByRole("button", { name: "Open account" }));
  await waitFor(() =>
    expect(
      bankingStore
        .read()
        .accounts.some((account) => account.currency === "EUR"),
    ).toBe(true),
  );
});
it("keeps card applications on the product page and links existing cards to their controls", async () => {
  await login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  mount(<ProductDetail slug="everyday-debit-card" />);
  expect(
    await screen.findByRole("heading", {
      name: "Everyday Debit Card",
      level: 1,
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Apply now" })).toHaveAttribute(
    "href",
    "#apply",
  );
  expect(
    await screen.findByRole("link", { name: /Visa Debit/ }),
  ).toHaveAttribute("href", "/app/cards/card_aster_debit");
  expect(
    screen.getByText(
      "Your existing demo cards are separate from pending applications.",
    ),
  ).toBeInTheDocument();
});
it("connects public investment and payments guides to available workflows", async () => {
  const investment = mount(<ProductDetail slug="bond-investing" />);
  expect(
    await screen.findByRole("link", {
      name: "Explore investment and suitability",
    }),
  ).toHaveAttribute(
    "href",
    "/login?next=%2Fapp%2Fwealth%2Fproducts%2Fproduct_bond",
  );
  investment.unmount();
  mount(<ProductDetail slug="payments-transfers" />);
  expect(
    await screen.findByRole("heading", { name: "Use this service" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Eligibility" }),
  ).not.toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: "Make a transfer" }),
  ).toHaveAttribute("href", "/login?next=%2Fapp%2Fpayments%2Ftransfers%2Fnew");
});
it("shows authenticated investment and payment actions without another login", async () => {
  await login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  const investment = mount(<ProductDetail slug="bond-investing" />);
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "Explore investment and suitability" }),
    ).toHaveAttribute("href", "/app/wealth/products/product_bond"),
  );
  expect(
    await screen.findByRole("link", {
      name: "View position in your portfolio",
    }),
  ).toHaveAttribute("href", "/app/wealth");
  investment.unmount();
  mount(<ProductDetail slug="payments-transfers" />);
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "Make a transfer" }),
    ).toHaveAttribute("href", "/app/payments/transfers/new"),
  );
});
it("support articles offer a direct banking action", async () => {
  mount(<ArticleDetail slug="account-statements" />);
  expect(
    await screen.findByRole("link", { name: "View your transactions" }),
  ).toHaveAttribute("href", "/login?next=%2Fapp%2Ftransactions");
});
