import { http, HttpResponse } from "msw";
import type { components } from "@/generated/public-api";
import { publicHome, publicNavigation } from "./fixtures";
import { catalog } from "./catalog";
import { articles } from "./support";
import { rates } from "./rates";
import { offers } from "./offers";
import { provenance } from "./metadata";
import { matches, searchPublic } from "./search";
const json = <T extends object>(data: T) =>
  HttpResponse.json(structuredClone(data));
const error = (
  status: number,
  code: components["schemas"]["PublicApiError"]["code"],
  message: string,
) => HttpResponse.json({ code, message }, { status });
const categories = [
  "BANKING",
  "CARDS",
  "BORROWING",
  "INVESTMENTS",
  "INSURANCE",
  "PAYMENTS_FX",
  "SUPPORT",
];
const types = [
  "CURRENT_ACCOUNT",
  "SAVINGS_ACCOUNT",
  "TIME_DEPOSIT",
  "MULTI_CURRENCY_ACCOUNT",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "PERSONAL_LOAN",
  "MORTGAGE",
  "OVERDRAFT",
  "INVESTMENT_PRODUCT",
  "INSURANCE_PRODUCT",
  "BANKING_SERVICE",
];
const supportCategories = [
  "ACCOUNTS",
  "PAYMENTS",
  "CARDS",
  "SECURITY",
  "DIGITAL_BANKING",
  "INVESTMENTS",
];
export const publicHandlers = [
  http.get("/public/home", () => json(publicHome)),
  http.get("/public/navigation", () => json(publicNavigation)),
  http.get("/public/catalog", ({ request }) => {
    const p = new URL(request.url).searchParams,
      category = p.get("category"),
      type = p.get("type"),
      search = p.get("search") ?? "";
    if (
      (category && !categories.includes(category)) ||
      (type && !types.includes(type)) ||
      search.length > 200
    )
      return error(400, "INVALID_PUBLIC_QUERY", "Invalid catalog filter.");
    const items = catalog
      .filter(
        (i) =>
          (!category || i.category === category) &&
          (!type || i.type === type) &&
          matches(
            `${i.title} ${i.shortDescription} ${i.tags.join(" ")}`,
            search,
          ),
      )
      .map(
        ({
          id,
          slug,
          category,
          type,
          title,
          shortDescription,
          fees,
          tags,
          lastUpdatedAt,
          environment,
        }) => ({
          id,
          slug,
          category,
          type,
          title,
          shortDescription,
          fees,
          tags,
          lastUpdatedAt,
          environment,
        }),
      );
    return json({
      ...provenance,
      items,
    } satisfies components["schemas"]["PublicCatalog"]);
  }),
  http.get("/public/catalog/:slug", ({ params }) => {
    const item = catalog.find((i) => i.slug === params.slug);
    return item
      ? json(item)
      : error(404, "PUBLIC_CONTENT_NOT_FOUND", "Product or service not found.");
  }),
  http.get("/public/support/articles", ({ request }) => {
    const p = new URL(request.url).searchParams,
      category = p.get("category"),
      search = p.get("search") ?? "";
    if (
      (category && !supportCategories.includes(category)) ||
      search.length > 200
    )
      return error(400, "INVALID_PUBLIC_QUERY", "Invalid article filter.");
    const items = articles
      .filter(
        (i) =>
          (!category || i.category === category) &&
          matches(
            `${i.title} ${i.summary} ${i.tags.join(" ")} ${i.sections.flatMap((s) => s.paragraphs).join(" ")}`,
            search,
          ),
      )
      .map(
        ({
          id,
          slug,
          title,
          summary,
          category,
          tags,
          lastUpdatedAt,
          environment,
        }) => ({
          id,
          slug,
          title,
          summary,
          category,
          tags,
          lastUpdatedAt,
          environment,
        }),
      );
    return json({
      ...provenance,
      items,
    } satisfies components["schemas"]["SupportArticles"]);
  }),
  http.get("/public/support/articles/:slug", ({ params }) => {
    const item = articles.find((i) => i.slug === params.slug);
    return item
      ? json(item)
      : error(404, "PUBLIC_CONTENT_NOT_FOUND", "Article not found.");
  }),
  http.get("/public/rates", () => json(rates)),
  http.get("/public/offers", () =>
    json({
      ...provenance,
      items: offers,
    } satisfies components["schemas"]["PublicOffers"]),
  ),
  http.get("/public/search", ({ request }) => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return q.length > 200
      ? error(
          400,
          "INVALID_PUBLIC_QUERY",
          "Search must be 200 characters or fewer.",
        )
      : json(searchPublic(q));
  }),
];
