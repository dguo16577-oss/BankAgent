"use client";
import { useLocale } from "@/lib/i18n/locale";

import { applicationProductTypes } from "@/features/applications/product-types";
import { ProductApplication } from "@/features/applications/product-application";
import { ProductActions, SupportActions } from "./product-actions";
import { CurrencyAccountOpening, TimeDepositOpening } from "./deposit-actions";
import { investmentProductId, productCapability } from "./product-capabilities";
import { NewInvestment } from "@/features/wealth/new-investment";
import { InvestmentReview } from "@/features/wealth/investment-review";
import { useQuery } from "@tanstack/react-query";
import { sessionOptions } from "@/lib/api/session";
import { estimateFx } from "./fx-estimate";
import { CustomerEntry } from "./customer-entry";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import type { components } from "@/generated/public-api";
import type { CatalogFilters, SupportFilters } from "@/lib/api/public";
import {
  usePublicNavigation,
  useCatalog,
  useCatalogItem,
  useCatalogDetails,
  useArticles,
  useArticle,
  useRates,
  useOffers,
} from "./use-public";
import { ContentCards, PublicError } from "./public-homepage";
export const field =
  "mt-2 w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm";
export const human = (s: string) => s.toLowerCase().replaceAll("_", " ");
export function PageFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const { t } = useLocale();

  return (
    <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
      <Link href="/" className="text-sm text-muted-foreground underline">
        {t("Aster Bank home")}
      </Link>
      <p className="mt-8 text-xs font-semibold tracking-widest text-teal-800">
        {t("Products and services")}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{t(title)}</h1>
      {t(
        description && (
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            {t(description)}
          </p>
        ),
      )}
      <div className="mt-9 space-y-8">{t(children)}</div>
      <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        {t("Manage your banking in one place.")}
        {t(" ")}
        <span className="font-semibold text-primary underline">
          <CustomerEntry />
        </span>
      </p>
    </section>
  );
}
export function Provenance({
  data,
}: {
  data: { environment: "DEMO"; lastUpdatedAt: string };
}) {
  const { t } = useLocale();

  return (
    <p className="text-xs text-muted-foreground">
      {t(data.environment)}
      {t(" · Updated")}
      {t(" ")}
      <time dateTime={data.lastUpdatedAt}>
        {t(data.lastUpdatedAt.replace("T", " "))}
      </time>
    </p>
  );
}
function Loading() {
  const { t } = useLocale();

  return (
    <p role="status" className="px-5 py-16">
      {t("Loading public content…")}
    </p>
  );
}
function Failure({ error, retry }: { error: Error; retry: () => void }) {
  const { t } = useLocale();

  return error instanceof ApiError && error.status === 404 ? (
    <PageFrame title={t("Content not found")}>
      <p role="alert">{t("This public item could not be found.")}</p>
      <Link href="/support" className="underline">
        {t("Browse support")}
      </Link>
    </PageFrame>
  ) : (
    <PublicError retry={retry} />
  );
}
const card = (
  i: components["schemas"]["PublicCatalogItemSummary"],
): components["schemas"]["PublicContentCard"] => ({
  id: i.id,
  title: i.title,
  description: i.shortDescription,
  route: `/products/${i.slug}`,
  label: productCapability(i).label,
  environment: i.environment,
  lastUpdatedAt: i.lastUpdatedAt,
});
const articleCard = (
  i: components["schemas"]["SupportArticleSummary"],
): components["schemas"]["PublicContentCard"] => ({
  id: i.id,
  title: i.title,
  description: i.summary,
  route: `/support/${i.slug}`,
  label: human(i.category),
  environment: i.environment,
  lastUpdatedAt: i.lastUpdatedAt,
});
const routeCategory: Record<string, NonNullable<CatalogFilters["category"]>> = {
  "/banking": "BANKING",
  "/cards": "CARDS",
  "/borrowing": "BORROWING",
  "/investments": "INVESTMENTS",
  "/insurance": "INSURANCE",
  "/payments-fx": "PAYMENTS_FX",
};
const categoryActions: Record<string, { label: string; href: string }[]> = {
  "/banking": [
    { label: "View your accounts", href: "/app/accounts" },
    {
      label: "Open a currency account",
      href: "/products/global-currency-account#open-currency-account",
    },
    {
      label: "Open a 12-month time deposit",
      href: "/products/time-deposit#open-time-deposit",
    },
  ],
  "/cards": [
    { label: "Compare cards", href: "/cards/compare" },
    { label: "View all your cards", href: "/app/cards" },
    { label: "Track your applications", href: "/app/applications" },
  ],
  "/borrowing": [
    {
      label: "Apply for a personal loan",
      href: "/products/personal-loan#apply",
    },
    { label: "Apply for a mortgage", href: "/products/home-mortgage#apply" },
    { label: "Request an overdraft", href: "/products/overdraft#apply" },
    { label: "Track your applications", href: "/app/applications" },
  ],
  "/investments": [
    { label: "View portfolio and orders", href: "/app/wealth" },
    {
      label: "Start money market investment",
      href: "/products/money-market-investing#invest",
    },
  ],
  "/insurance": [
    {
      label: "Apply for life insurance",
      href: "/products/life-insurance#apply",
    },
    { label: "Track your applications", href: "/app/applications" },
  ],
  "/payments-fx": [
    { label: "Make a transfer", href: "/app/payments/transfers/new" },
    { label: "View demo exchange rates", href: "/rates" },
  ],
};
export function CatalogPage({ route }: { route: string }) {
  const { t } = useLocale();
  const session = useQuery(sessionOptions);

  const [search, setSearch] = useState(""),
    [type, setType] = useState<CatalogFilters["type"]>();
  const nav = usePublicNavigation(),
    query = useCatalog({ category: routeCategory[route], search, type });
  const heading = nav.data?.categories.find((c) => c.route === route);
  return (
    <PageFrame
      title={t(
        heading?.title ?? route.slice(1).replace(/^./, (c) => c.toUpperCase()),
      )}
      description={t(heading?.description)}
    >
      <form
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-4 rounded-xl border bg-background p-5 sm:grid-cols-2"
      >
        <label className="text-sm font-medium">
          {t("Search products")}
          <input
            className={field}
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
          />
        </label>
        <label className="text-sm font-medium">
          {t("Product type")}
          <select
            className={field}
            value={type ?? ""}
            onChange={(e) =>
              setType((e.target.value || undefined) as CatalogFilters["type"])
            }
          >
            <option value="">{t("All types")}</option>
            {[
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
            ].map((optionType) => (
              <option key={optionType} value={optionType}>
                {t(human(optionType))}
              </option>
            ))}
          </select>
        </label>
      </form>
      <div className="flex flex-wrap gap-3" aria-label={t("Available actions")}>
        {(categoryActions[route] ?? []).map((action) => (
          <Button asChild variant="outline" key={action.href}>
            <Link
              href={
                action.href.startsWith("/app/") && !session.data?.authenticated
                  ? `/login?next=${encodeURIComponent(action.href)}`
                  : action.href
              }
            >
              {t(action.label)}
            </Link>
          </Button>
        ))}
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <PublicError retry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.items.length ? (
            <ContentCards items={query.data.items.map(card)} />
          ) : (
            <p role="status">{t("No products match these filters.")}</p>
          )}
          <Provenance data={query.data} />
        </>
      )}
      {route === "/banking" && (
        <Link
          href="/payments-fx"
          className="inline-block font-semibold underline"
        >
          {t("Explore payments & foreign exchange →")}
        </Link>
      )}
    </PageFrame>
  );
}
export function ProductDetail({ slug }: { slug: string }) {
  const { t } = useLocale();

  const query = useCatalogItem(slug),
    catalog = useCatalog();
  if (query.isPending) return <Loading />;
  if (query.isError)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const item = query.data;
  const isService = item.type === "BANKING_SERVICE";
  const investmentId = investmentProductId(item.id);
  return (
    <PageFrame title={t(item.title)} description={t(item.description)}>
      <p className="text-sm capitalize">
        {t(human(item.category))} · {t(human(item.type))}
      </p>
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent>
            <h2 className="text-xl font-semibold">{t("Highlights")}</h2>
            <ul className="mt-4 list-disc space-y-3 pl-5">
              {item.highlights.map((x) => (
                <li key={x}>{t(x)}</li>
              ))}
            </ul>
            {!isService &&
              item.type !== "TIME_DEPOSIT" &&
              item.type !== "MULTI_CURRENCY_ACCOUNT" && (
                <>
                  <h2 className="mt-8 text-xl font-semibold">
                    {t("Features")}
                  </h2>
                  {item.features.map((f) => (
                    <div key={f.title} className="mt-5">
                      <h3 className="font-semibold">{t(f.title)}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {t(f.description)}
                      </p>
                    </div>
                  ))}
                </>
              )}
          </CardContent>
        </Card>
        <Card className="bg-secondary/40">
          <CardContent>
            <h2 className="text-xl font-semibold">
              {t(isService ? "Use this service" : "Eligibility")}
            </h2>
            {isService ? (
              <p className="mt-4 text-sm leading-6">
                {t(
                  "Choose an available action below. Customer transactions require sign-in and confirmation.",
                )}
              </p>
            ) : (
              <>
                <p className="mt-4 text-sm leading-6">
                  {t(item.eligibility.summary)}
                </p>
                {item.eligibility.requirements.map((r) => (
                  <p key={r} className="mt-3 text-sm">
                    {t(r)}
                  </p>
                ))}
              </>
            )}
            {!isService && item.supportedCurrencies && (
              <p className="mt-5 text-sm">
                {t(
                  item.type === "MULTI_CURRENCY_ACCOUNT"
                    ? "Available currencies to open: "
                    : "Supported currencies: ",
                )}
                {item.type === "MULTI_CURRENCY_ACCOUNT"
                  ? item.supportedCurrencies
                      .filter((currency) => currency !== "CNY")
                      .join(", ")
                  : item.supportedCurrencies.join(", ")}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {applicationProductTypes.includes(item.type) && (
                <Button asChild>
                  <Link href="#apply">{t("Apply now")}</Link>
                </Button>
              )}
              {item.type === "TIME_DEPOSIT" && (
                <Button asChild>
                  <a href="#open-time-deposit">{t("Deposit now")}</a>
                </Button>
              )}
              {item.type === "MULTI_CURRENCY_ACCOUNT" && (
                <Button asChild>
                  <a href="#open-currency-account">{t("Open account")}</a>
                </Button>
              )}
              {investmentId && (
                <Button asChild>
                  <a href="#invest">{t("Start investment")}</a>
                </Button>
              )}
              {item.cta
                .filter((c) => c.type !== "SIGN_IN")
                .map((c) => (
                  <Button asChild variant="outline" key={c.type}>
                    <Link href={c.route}>{t(c.label)}</Link>
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
      {item.type !== "TIME_DEPOSIT" &&
        item.type !== "MULTI_CURRENCY_ACCOUNT" && (
          <ProductActions item={item} />
        )}
      {item.type === "TIME_DEPOSIT" && <TimeDepositOpening />}
      {item.type === "MULTI_CURRENCY_ACCOUNT" && <CurrencyAccountOpening />}
      {applicationProductTypes.includes(item.type) && (
        <ProductApplication productId={item.id} />
      )}
      {investmentId && (
        <PublicInvestment productId={investmentId} slug={slug} />
      )}
      <section>
        <h2 className="mb-4 text-2xl font-semibold">
          {t("Fees & considerations")}
        </h2>
        <FeeList fees={item.fees} />
      </section>
      <section className="rounded-xl border bg-background p-6">
        <h2 className="font-semibold">{t("Before you decide")}</h2>
        {item.disclaimers.map((d) => (
          <p key={d} className="mt-3 text-sm leading-6">
            {t(d)}
          </p>
        ))}
      </section>
      <section>
        <h2 className="mb-5 text-2xl font-semibold">{t("Related services")}</h2>
        {catalog.isError ? (
          <PublicError retry={() => void catalog.refetch()} />
        ) : catalog.isPending ? (
          <Loading />
        ) : (
          <ContentCards
            items={catalog.data.items
              .filter((i) => item.relatedItemIds.includes(i.id))
              .map(card)}
          />
        )}
      </section>
      <Provenance data={item} />
    </PageFrame>
  );
}
function PublicInvestment({
  productId,
  slug,
}: {
  productId: string;
  slug: string;
}) {
  const { t } = useLocale();
  const session = useQuery(sessionOptions);
  const [intentId, setIntentId] = useState<string>();
  return (
    <section
      id="invest"
      className="scroll-mt-8 space-y-5 rounded-xl border bg-background p-5 sm:p-7"
    >
      <h2 className="text-2xl font-semibold">{t("Start investment")}</h2>
      {session.isPending ? (
        <p role="status">{t("Checking your session…")}</p>
      ) : session.data?.authenticated ? (
        intentId ? (
          <InvestmentReview
            intentId={intentId}
            inline
            onBack={() => setIntentId(undefined)}
          />
        ) : (
          <NewInvestment
            productId={productId}
            inline
            onPrepared={setIntentId}
          />
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t(
              "Sign in to check suitability and prepare an investment order. You will return to this page.",
            )}
          </p>
          <Button asChild>
            <Link
              href={`/login?next=${encodeURIComponent(`/products/${slug}#invest`)}`}
            >
              {t("Sign in to continue")}
            </Link>
          </Button>
        </>
      )}
    </section>
  );
}
function FeeList({
  fees,
}: {
  fees: components["schemas"]["PublicFeeSummary"][];
}) {
  const { t } = useLocale();

  return (
    <dl className="divide-y rounded-xl border px-5">
      {fees.map((f) => (
        <div key={f.label} className="py-5">
          <dt className="font-semibold">{t(f.label)}</dt>
          <dd className="mt-2">
            {t(f.value)}
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t(f.conditions)}
            </p>
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function CompareCards() {
  const { t } = useLocale();

  const catalog = useCatalog({ category: "CARDS" });
  const [selected, setSelected] = useState<string[]>([]);
  const details = useCatalogDetails(selected);
  return (
    <PageFrame
      title={t("Compare cards")}
      description={t(
        "Choose up to three simulated card products. Review fees, eligibility and features side by side.",
      )}
    >
      {catalog.isPending ? (
        <Loading />
      ) : catalog.isError ? (
        <PublicError retry={() => void catalog.refetch()} />
      ) : (
        <fieldset className="flex flex-wrap gap-4 rounded-xl border p-5">
          <legend className="px-2 text-sm font-semibold">
            {t("Select up to 3 cards")}
          </legend>
          {catalog.data.items.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(c.slug)}
                disabled={!selected.includes(c.slug) && selected.length >= 3}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, c.slug]
                      : selected.filter((s) => s !== c.slug),
                  )
                }
              />
              {t(c.title)}
            </label>
          ))}
        </fieldset>
      )}
      {!selected.length && (
        <p role="status">{t("Select cards to begin your comparison.")}</p>
      )}
      <div className="grid items-start gap-5 md:grid-cols-3">
        {details.map((q, i) =>
          q.isPending ? (
            <Loading key={selected[i]} />
          ) : q.isError ? (
            <PublicError key={selected[i]} retry={() => void q.refetch()} />
          ) : (
            <Card key={q.data.id}>
              <CardContent>
                <h2 className="text-xl font-semibold">
                  <Link href={`/products/${q.data.slug}`} className="underline">
                    {t(q.data.title)}
                  </Link>
                </h2>
                <dl className="mt-5 space-y-5">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("Card type")}
                    </dt>
                    <dd className="mt-1 capitalize">{t(human(q.data.type))}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("Annual fee")}
                    </dt>
                    <dd className="mt-1">
                      {t(
                        q.data.fees.find((f) => f.label === "Annual fee")
                          ?.value ?? "See product terms",
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("Key benefits")}
                    </dt>
                    <dd className="mt-1 text-sm leading-6">
                      {t(q.data.highlights.join(". "))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("FX / travel features")}
                    </dt>
                    <dd className="mt-1 text-sm leading-6">
                      {t(
                        q.data.features.find((f) => f.title === "FX / travel")
                          ?.description,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("Eligibility")}
                    </dt>
                    <dd className="mt-1 text-sm leading-6">
                      {t(q.data.eligibility.summary)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5">
                  <Provenance data={q.data} />
                </div>
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </PageFrame>
  );
}
export function RatesPage() {
  const { t } = useLocale();

  const q = useRates();
  const [amount, setAmount] = useState("100.00");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("CNY");
  const fx = q.data?.items.filter((rate) => rate.kind === "FX") ?? [];
  const deposit = q.data?.items.filter((rate) => rate.kind !== "FX") ?? [];
  const reference: Record<string, string> = { CNY: "1.0000" };
  for (const rate of fx) reference[rate.title.split(" / ")[0]] = rate.value;
  const currencies = ["CNY", ...fx.map((rate) => rate.title.split(" / ")[0])];
  const converted = estimateFx(
    amount,
    reference[from] ?? "",
    reference[to] ?? "",
  );
  return (
    <PageFrame
      title={t("Rates")}
      description={t("Illustrative demo rates, not live quotes.")}
    >
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <PublicError retry={() => void q.refetch()} />
      ) : (
        <>
          <p className="text-sm">
            {t("Source: ")}
            {t(q.data.source)}
            {t(" · As of")}
            {t(q.data.asOf)}
          </p>
          <section className="rounded-xl border bg-secondary/40 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">
              {t("Reference currency converter")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "This uses fixed demo mid-rates. It is not a live quote, and no exchange can be executed here.",
              )}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-[1.2fr_1fr_1fr]">
              <label className="text-sm font-medium">
                {t("Amount")}
                <input
                  className={field}
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={converted === null}
                />
              </label>
              <label className="text-sm font-medium">
                {t("From currency")}
                <select
                  className={field}
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                >
                  {currencies.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {t("To currency")}
                <select
                  className={field}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                >
                  {currencies.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </label>
            </div>
            <p
              className="mt-5 text-lg font-semibold tabular-nums"
              role="status"
            >
              {converted === null
                ? t("Enter a valid amount with up to two decimal places.")
                : `≈ ${converted} ${to}`}
            </p>
          </section>
          <h2 className="text-2xl font-semibold">
            {t("Illustrative currency rates")}
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {fx.map((r) => (
              <Card key={r.id}>
                <CardContent>
                  <h2 className="text-xl font-semibold">{t(r.title)}</h2>
                  <p className="mt-5 text-3xl font-semibold">{t(r.value)}</p>
                  <p className="mt-2 text-sm">{t(r.unit)}</p>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {t(r.conditions)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <h2 className="text-2xl font-semibold">
            {t("Illustrative savings rates")}
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {deposit.map((r) => (
              <Card key={r.id}>
                <CardContent>
                  <h3 className="text-xl font-semibold">{t(r.title)}</h3>
                  <p className="mt-5 text-3xl font-semibold">{t(r.value)}</p>
                  <p className="mt-2 text-sm">{t(r.unit)}</p>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {t(r.conditions)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Provenance data={q.data} />
          <Link href="/fees" className="underline">
            {t("Understand demo fees →")}
          </Link>
        </>
      )}
    </PageFrame>
  );
}
export function FeesPage() {
  const { t } = useLocale();

  const q = useCatalog();
  return (
    <PageFrame
      title={t("Fees")}
      description={t(
        "Structured demo fee examples. Read each product’s conditions; these figures are not an offer or a live quote.",
      )}
    >
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <PublicError retry={() => void q.refetch()} />
      ) : q.data.items.length ? (
        <div className="grid gap-6 md:grid-cols-2">
          {q.data.items.map((item) => (
            <section key={item.id}>
              <h2 className="mb-3 text-lg font-semibold">
                <Link href={`/products/${item.slug}`} className="underline">
                  {t(item.title)}
                </Link>
              </h2>
              <FeeList fees={item.fees} />
            </section>
          ))}
        </div>
      ) : (
        <p role="status">{t("No fee information is available.")}</p>
      )}
      {q.data && <Provenance data={q.data} />}
    </PageFrame>
  );
}
export function SupportPage({ insights = false }: { insights?: boolean }) {
  const { t } = useLocale();

  const [search, setSearch] = useState(""),
    [category, setCategory] = useState<SupportFilters["category"]>();
  const q = useArticles({ category, search: insights ? "insight" : search });
  return (
    <PageFrame
      title={t(insights ? "Insights" : "Support")}
      description={t(
        insights
          ? "Practical education about money, risk and safer banking. No personalised advice or market predictions."
          : "Browse the Aster knowledge center. Public guidance, without signing in.",
      )}
    >
      {!insights && (
        <div className="grid gap-4 rounded-xl border bg-background p-5 sm:grid-cols-2">
          <label className="text-sm font-medium">
            {t("Search support")}
            <input
              type="search"
              maxLength={200}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={field}
            />
          </label>
          <label className="text-sm font-medium">
            {t("Support category")}
            <select
              className={field}
              value={category ?? ""}
              onChange={(e) =>
                setCategory(
                  (e.target.value || undefined) as SupportFilters["category"],
                )
              }
            >
              <option value="">{t("All categories")}</option>
              {[
                "ACCOUNTS",
                "PAYMENTS",
                "CARDS",
                "SECURITY",
                "DIGITAL_BANKING",
                "INVESTMENTS",
              ].map((c) => (
                <option key={c} value={c}>
                  {t(human(c))}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <PublicError retry={() => void q.refetch()} />
      ) : (
        <>
          {q.data.items.length ? (
            <ContentCards items={q.data.items.map(articleCard)} />
          ) : (
            <p role="status">{t("No articles match these filters.")}</p>
          )}
          <Provenance data={q.data} />
        </>
      )}
    </PageFrame>
  );
}
export function ArticleDetail({ slug }: { slug: string }) {
  const { t } = useLocale();

  const q = useArticle(slug),
    related = useArticles();
  if (q.isPending) return <Loading />;
  if (q.isError)
    return <Failure error={q.error} retry={() => void q.refetch()} />;
  const a = q.data;
  return (
    <PageFrame title={t(a.heading)} description={t(a.summary)}>
      <Link href="/support" className="underline">
        {t("← All support articles")}
      </Link>
      <article className="max-w-3xl space-y-8">
        {a.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-2xl font-semibold">{t(s.heading)}</h2>
            {s.paragraphs.map((p) => (
              <p key={p} className="mt-4 leading-8 text-muted-foreground">
                {t(p)}
              </p>
            ))}
            {s.callouts.map((c) => (
              <aside
                key={c}
                className="mt-6 rounded-xl border bg-secondary p-5 text-sm leading-7"
              >
                {t(c)}
              </aside>
            ))}
          </section>
        ))}
      </article>
      <SupportActions slug={a.slug} />
      <Provenance data={a} />
      <section>
        <h2 className="mb-5 text-2xl font-semibold">{t("Related articles")}</h2>
        {related.isError ? (
          <PublicError retry={() => void related.refetch()} />
        ) : related.isPending ? (
          <Loading />
        ) : (
          <ContentCards
            items={related.data.items
              .filter((i) => a.relatedArticles.includes(i.slug))
              .map(articleCard)}
          />
        )}
      </section>
    </PageFrame>
  );
}
export function OffersPage() {
  const { t } = useLocale();

  const q = useOffers();
  return (
    <PageFrame
      title={t("Offers")}
      description={t(
        "Illustrative campaigns to help you explore. No rewards, discounts or entitlements are issued.",
      )}
    >
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <PublicError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length && (
            <p role="status">{t("No demo offers are available.")}</p>
          )}
          <div className="grid gap-6 md:grid-cols-2">
            {q.data.items.map((o) => (
              <Card id={o.id} key={o.id}>
                <CardContent>
                  <h3 className="text-2xl font-semibold">{t(o.title)}</h3>
                  <p className="mt-4 leading-7 text-muted-foreground">
                    {t(o.summary)}
                  </p>
                  <p className="mt-4 text-xs">
                    {t("Illustrative campaign dates: ")}
                    {t(o.validFrom.slice(0, 10))} –{t(" ")}
                    {t(o.validUntil.slice(0, 10))}
                  </p>
                  <p className="mt-4 text-sm leading-6">{t(o.termsSummary)}</p>
                  <Link
                    href={o.route}
                    className="mt-5 inline-block font-semibold underline"
                  >
                    {t("Explore ")}
                    {t(o.title)}
                  </Link>
                  <div className="mt-5">
                    <Provenance data={o} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Provenance data={q.data} />
        </>
      )}
    </PageFrame>
  );
}
