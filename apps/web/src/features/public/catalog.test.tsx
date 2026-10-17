import { vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
import { beforeEach, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { catalog } from "@/mocks/public/catalog";
import { articles } from "@/mocks/public/support";
import { login, logout } from "@/lib/api/security";
import { securityFixture } from "@/mocks/data/security-fixture";
import { getCards } from "@/lib/api/cards";
import * as api from "@/lib/api/public";
import {
  CatalogPage,
  ProductDetail,
  CompareCards,
  RatesPage,
  FeesPage,
  SupportPage,
  ArticleDetail,
  OffersPage,
} from "./catalog-pages";
import { PublicSearchBox } from "./public-search";
beforeEach(() => bankingStore.reset());
function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}
it("catalog has 21 canonical demo products, closed taxonomy and provenance", async () => {
  const result = await api.getCatalog();
  expect(result.items).toHaveLength(21);
  expect(new Set(result.items.map((i) => i.category)).size).toBe(6);
  for (const i of result.items) {
    expect(i.environment).toBe("DEMO");
    expect(i.lastUpdatedAt).toMatch(/\+08:00$/);
    expect(catalog.find((c) => c.id === i.id)?.title).toBe(i.title);
  }
});
it("category filter is evaluated by API", async () => {
  expect((await api.getCatalog({ category: "CARDS" })).items).toHaveLength(4);
  expect((await api.getCatalog({ category: "SUPPORT" })).items).toEqual([]);
});
it("type filter is evaluated by API", async () => {
  const r = await api.getCatalog({ type: "CREDIT_CARD" });
  expect(r.items).toHaveLength(2);
  expect(r.items.every((i) => i.type === "CREDIT_CARD")).toBe(true);
});
it("catalog keyword search intersects filters", async () => {
  expect(
    (
      await api.getCatalog({ category: "BANKING", search: "FLEXIBLE savings" })
    ).items.map((i) => i.slug),
  ).toEqual(["flexible-savings"]);
  expect(
    (await api.getCatalog({ category: "CARDS", search: "savings" })).items,
  ).toEqual([]);
});
it("detail contains authoritative features, eligibility, fees and related IDs", async () => {
  const r = await api.getCatalogItem("flexible-savings");
  expect(r.fees[0].value).toBe("CNY 0 per month");
  expect(r.relatedItemIds.every((id) => catalog.some((i) => i.id === id))).toBe(
    true,
  );
  expect(r.cta.every((c) => c.type !== ("APPLY" as string))).toBe(true);
});
it.each(["/public/catalog/missing", "/public/support/articles/missing"])(
  "%s returns a unified 404",
  async (path) => {
    const r = await fetch(path);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({
      code: "PUBLIC_CONTENT_NOT_FOUND",
      message: expect.any(String),
    });
  },
);
it.each([
  "/public/catalog?category=WRONG",
  "/public/catalog?type=WRONG",
  "/public/support/articles?category=WRONG",
  `/public/search?q=${"x".repeat(201)}`,
])("%s rejects invalid input", async (path) => {
  expect((await fetch(path)).status).toBe(400);
});
it("home derives products, offers, insights and rates from authoritative fixtures", async () => {
  const [home, offers, rates] = await Promise.all([
    api.getPublicHome(),
    api.getOffers(),
    api.getRates(),
  ]);
  for (const c of home.featuredServices) {
    const d = await api.getCatalogItem(c.route.split("/").at(-1)!);
    expect(c.title).toBe(d.title);
    expect(c.description).toBe(d.shortDescription);
  }
  expect(home.offers.map((o) => o.title)).toEqual(
    offers.items.map((o) => o.title),
  );
  expect(home.rates).toEqual(rates);
  for (const i of home.insights)
    expect(articles.some((a) => a.title === i.title)).toBe(true);
});
it("category component sends API filters and renders the API response", async () => {
  const seen: string[] = [];
  server.use(
    http.get("/public/catalog", ({ request }) => {
      seen.push(new URL(request.url).search);
      return HttpResponse.json({
        items: [{ ...catalog[0], title: "API supplied account" }],
        environment: "DEMO",
        lastUpdatedAt: catalog[0].lastUpdatedAt,
      });
    }),
  );
  mount(<CatalogPage route="/banking" />);
  expect(
    await screen.findByRole("heading", { name: "API supplied account" }),
  ).toBeInTheDocument();
  await userEvent.type(
    screen.getByRole("searchbox", { name: "Search products" }),
    "savings",
  );
  expect(
    seen.some(
      (s) => s.includes("category=BANKING") && s.includes("search=savings"),
    ),
  ).toBe(true);
});
it("product detail consumes the API, including fees and related services", async () => {
  mount(<ProductDetail slug="flexible-savings" />);
  expect(
    await screen.findByRole("heading", { name: "Flexible Savings", level: 1 }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Eligibility" }),
  ).toBeInTheDocument();
  expect(screen.getByText("CNY 0 per month")).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: "Explore Everyday Account" }),
  ).toHaveAttribute("href", "/products/everyday-account");
});
it.each(["flexible-savings", "life-insurance"])(
  "%s keeps the application on its product page",
  async (slug) => {
    await login({
      email: securityFixture.email,
      password: securityFixture.password,
    });
    mount(<ProductDetail slug={slug} />);
    expect(
      await screen.findByRole("link", { name: "Apply now" }),
    ).toHaveAttribute("href", "#apply");
    expect(
      await screen.findByRole("heading", { name: "Apply for a product" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Apply on this page after signing in. Applications are subject to review.",
      ),
    ).toBeVisible();
  },
);
it.each([
  ["home-mortgage", "Demo mortgage request", "Term (months)"],
  ["overdraft", "Demo overdraft request", "Requested overdraft limit (CNY)"],
])(
  "%s offers a distinct review-only form on its product page",
  async (slug, help, input) => {
    await login({
      email: securityFixture.email,
      password: securityFixture.password,
    });
    mount(<ProductDetail slug={slug} />);
    expect(
      await screen.findByRole("link", { name: "Apply now" }),
    ).toHaveAttribute("href", "#apply");
    expect(await screen.findByText(new RegExp(help))).toBeVisible();
    expect(screen.getByText(input)).toBeVisible();
  },
);
it("investment starts suitability and order preparation on its catalog page", async () => {
  await login({
    email: securityFixture.email,
    password: securityFixture.password,
  });
  mount(<ProductDetail slug="money-market-investing" />);
  expect(
    await screen.findByRole("link", { name: "Start investment" }),
  ).toHaveAttribute("href", "#invest");
  expect(
    await screen.findByRole("heading", { name: /Invest in/, level: 3 }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Check suitability and review" }),
  ).toBeEnabled();
});
it("product detail loading and 404 are explicit", async () => {
  server.use(
    http.get("/public/catalog/missing", async () => {
      await delay(30);
      return HttpResponse.json(
        { code: "PUBLIC_CONTENT_NOT_FOUND", message: "missing" },
        { status: 404 },
      );
    }),
  );
  mount(<ProductDetail slug="missing" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(
    await screen.findByRole("heading", { name: "Content not found" }),
  ).toBeInTheDocument();
});
it("catalog API error can retry", async () => {
  server.use(
    http.get("/public/catalog", () => new HttpResponse(null, { status: 500 })),
  );
  mount(<CatalogPage route="/banking" />);
  await screen.findByRole("alert");
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("heading", { name: "Everyday Account" }),
  ).toBeInTheDocument();
});
it("catalog shows an empty result", async () => {
  mount(<CatalogPage route="/banking" />);
  await screen.findByRole("heading", { name: "Everyday Account" });
  await userEvent.type(
    screen.getByRole("searchbox", { name: "Search products" }),
    "zzzzzz",
  );
  expect(
    await screen.findByText("No products match these filters."),
  ).toBeInTheDocument();
});
it("comparison selects at most three and shows catalog fees and eligibility", async () => {
  mount(<CompareCards />);
  const boxes = await screen.findAllByRole("checkbox");
  for (const b of boxes.slice(0, 3)) await userEvent.click(b);
  expect(boxes[3]).toBeDisabled();
  expect(await screen.findByText("CNY 300 example")).toBeInTheDocument();
  expect(screen.getAllByText("FX / travel features")).toHaveLength(3);
  await userEvent.click(boxes[0]);
  expect(boxes[3]).not.toBeDisabled();
});
it("rates retain decimal strings, provenance and explicit non-live semantics", async () => {
  const r = await api.getRates();
  expect(r.source).toBe("DEMO_RATE");
  expect(r.asOf).toMatch(/\+08:00$/);
  expect(r.items.filter((i) => i.kind === "FX")).toHaveLength(7);
  expect(r.items.find((i) => i.id === "jpy-cny")?.value).toBe("0.0480");
  expect(r.items.find((i) => i.id === "usd-cny")?.value).toBe("7.1000");
  mount(<RatesPage />);
  expect(await screen.findByText("7.1000")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("≈ 710.00 CNY");
  expect(
    screen.getByText("Illustrative demo rates, not live quotes."),
  ).toBeInTheDocument();
});
it("fees reference catalog conditions", async () => {
  mount(<FeesPage />);
  expect(
    await screen.findByRole("heading", { name: "Everyday Account" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Account fee").length).toBeGreaterThan(0);
});
it("support list has 15 structured articles and category/search filters", async () => {
  expect((await api.getArticles()).items).toHaveLength(15);
  expect((await api.getArticles({ category: "CARDS" })).items).toHaveLength(2);
  expect(
    (await api.getArticles({ search: "lost card" })).items.map((a) => a.slug),
  ).toContain("lost-card");
  const a = await api.getArticle("lost-card");
  expect(a.sections[0].paragraphs.length).toBeGreaterThan(0);
  expect(
    a.relatedArticles.every((s) => articles.some((i) => i.slug === s)),
  ).toBe(true);
});
it("knowledge center filters at API and opens article routes", async () => {
  mount(<SupportPage />);
  await screen.findByRole("heading", {
    name: "What to do if your card is lost",
  });
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Support category" }),
    "CARDS",
  );
  await userEvent.type(
    screen.getByRole("searchbox", { name: "Search support" }),
    "lost",
  );
  expect(
    await screen.findByRole("link", {
      name: "Explore What to do if your card is lost",
    }),
  ).toHaveAttribute("href", "/support/lost-card");
});
it("article detail shows sections, callouts and related knowledge", async () => {
  mount(<ArticleDetail slug="lost-card" />);
  expect(
    await screen.findByRole("heading", {
      name: "What to do if your card is lost",
      level: 1,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "This public demo cannot freeze a real card or report a loss.",
    ),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("link", {
      name: "Explore Understanding pending card payments",
    }),
  ).toBeInTheDocument();
});
it("article not found is shown", async () => {
  mount(<ArticleDetail slug="missing" />);
  expect(
    await screen.findByRole("heading", { name: "Content not found" }),
  ).toBeInTheDocument();
});
it("global keyword search spans all three explicit result types", async () => {
  const r = await api.searchPublic("card");
  expect(new Set(r.items.map((i) => i.type))).toEqual(
    new Set(["CATALOG_ITEM", "SUPPORT_ARTICLE", "OFFER"]),
  );
  expect(r.items.every((i) => i.matchedTerms.includes("card"))).toBe(true);
  expect((await api.searchPublic("")).items).toEqual([]);
  expect((await api.searchPublic("zzzzzz")).items).toEqual([]);
});
it("public search box submits a real query and links to knowledge", async () => {
  mount(<PublicSearchBox />);
  await userEvent.type(screen.getByRole("searchbox"), "lost card");
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(
    await screen.findByRole("link", {
      name: "What to do if your card is lost",
    }),
  ).toHaveAttribute("href", "/support/lost-card");
});
it("offers show dates and demo terms", async () => {
  mount(<OffersPage />);
  expect(
    await screen.findByRole("heading", { name: "Build a savings habit" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/No cash reward/)).toBeInTheDocument();
  expect((await api.getOffers()).items).toHaveLength(2);
});
it("insights reuse four educational support articles", async () => {
  mount(<SupportPage insights />);
  expect(
    await screen.findByRole("heading", { name: "Understanding bond risk" }),
  ).toBeInTheDocument();
  expect(await screen.findAllByRole("heading", { level: 3 })).toHaveLength(4);
});
it.each(["anonymous", "expired", "logged-out"])(
  "all public APIs remain accessible when %s while customer stays protected",
  async (state) => {
    if (state !== "anonymous") {
      await login({
        email: securityFixture.email,
        password: securityFixture.password,
      });
      if (state === "expired") bankingStore.clock.advance(60 * 60_000);
      else await logout();
    }
    const before = bankingStore.read();
    for (const request of [
      () => api.getCatalog(),
      () => api.getCatalogItem("flexible-savings"),
      () => api.getArticles(),
      () => api.getArticle("lost-card"),
      () => api.getRates(),
      () => api.getOffers(),
      () => api.searchPublic("card"),
      () => api.getPublicHome(),
      () => api.getPublicNavigation(),
    ])
      expect((await request()).environment).toBe("DEMO");
    expect(bankingStore.read()).toEqual(before);
    await expect(getCards()).rejects.toMatchObject({ status: 401 });
  },
);
