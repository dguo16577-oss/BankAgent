"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccounts } from "@/features/accounts/use-accounts";
import { useCards } from "@/features/cards/use-cards";
import { usePortfolio } from "@/features/wealth/use-wealth";
import { sessionOptions } from "@/lib/api/session";
import { useLocale } from "@/lib/i18n/locale";
import type { components } from "@/generated/public-api";
import {
  investmentProductId,
  productCapability,
  productServiceActions,
  supportActions,
} from "./product-capabilities";

type Product = Pick<
  components["schemas"]["PublicCatalogItemDetail"],
  "id" | "type" | "category"
>;

function ActionLink({
  href,
  label,
  authenticated,
}: {
  href: string;
  label: string;
  authenticated: boolean;
}) {
  const { t } = useLocale();
  const destination =
    href.startsWith("/app/") && !authenticated
      ? `/login?next=${encodeURIComponent(href)}`
      : href;
  return (
    <Button asChild variant="outline">
      <Link href={destination}>{t(label)}</Link>
    </Button>
  );
}

function ExistingAccounts({ type }: { type: Product["type"] }) {
  const { t, errorMessage } = useLocale();
  const accounts = useAccounts();
  if (accounts.isPending)
    return <p role="status">{t("Loading your accounts…")}</p>;
  if (accounts.isError)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <span>{errorMessage(accounts.error)}</span>
        <Button variant="outline" onClick={() => void accounts.refetch()}>
          {t("Retry")}
        </Button>
      </div>
    );
  const matching = accounts.data.accounts.filter((account) =>
    type === "CURRENT_ACCOUNT"
      ? account.type === "CURRENT"
      : type === "SAVINGS_ACCOUNT"
        ? account.type === "SAVINGS"
        : type === "MULTI_CURRENCY_ACCOUNT"
          ? account.type === "MULTI_CURRENCY"
          : false,
  );
  return matching.length ? (
    <ul className="grid gap-3 sm:grid-cols-2">
      {matching.map((account) => (
        <li key={account.id}>
          <Link
            href={`/app/accounts/${encodeURIComponent(account.id)}`}
            className="block rounded-lg border p-4 hover:bg-secondary/50"
          >
            <span className="block font-semibold">{account.displayName}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {account.maskedAccountNumber} · {t(account.status)}
            </span>
            <span className="mt-2 block text-sm font-medium text-primary">
              {t("View account and activity →")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      {t("No matching account is currently open in your demo profile.")}
    </p>
  );
}

function ExistingCards() {
  const { t, errorMessage } = useLocale();
  const cards = useCards();
  if (cards.isPending) return <p role="status">{t("Loading cards…")}</p>;
  if (cards.isError)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <span>{errorMessage(cards.error)}</span>
        <Button variant="outline" onClick={() => void cards.refetch()}>
          {t("Retry")}
        </Button>
      </div>
    );
  return cards.data.items.length ? (
    <ul className="grid gap-3 sm:grid-cols-2">
      {cards.data.items.map((card) => (
        <li key={card.id}>
          <Link
            href={`/app/cards/${encodeURIComponent(card.id)}`}
            className="block rounded-lg border p-4 hover:bg-secondary/50"
          >
            <span className="block font-semibold">{card.displayName}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {card.maskedNumber} · {t(card.status)}
            </span>
            <span className="mt-2 block text-sm font-medium text-primary">
              {t("Manage card controls →")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      {t("No card has been issued in your demo profile.")}
    </p>
  );
}

function ExistingInvestment({ productId }: { productId: string }) {
  const { t, errorMessage } = useLocale();
  const portfolio = usePortfolio();
  if (portfolio.isPending)
    return <p role="status">{t("Loading portfolio…")}</p>;
  if (portfolio.isError)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <span>{errorMessage(portfolio.error)}</span>
        <Button variant="outline" onClick={() => void portfolio.refetch()}>
          {t("Retry")}
        </Button>
      </div>
    );
  const positions = portfolio.data.positions.filter(
    (position) => position.productId === productId,
  );
  return positions.length ? (
    <ul className="space-y-2 text-sm">
      {positions.map((position) => (
        <li key={position.id}>
          {position.displayName} ·{" "}
          <Link
            href="/app/wealth"
            className="font-medium text-primary underline"
          >
            {t("View position in your portfolio")}
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      {t("You do not hold this demo investment yet.")}
    </p>
  );
}

export function ProductActions({ item }: { item: Product }) {
  const { t } = useLocale();
  const session = useQuery(sessionOptions);
  const authenticated = !session.isError && !!session.data?.authenticated;
  const capability = productCapability(item);
  const investmentId = investmentProductId(item.id);
  const serviceActions = productServiceActions(item.id);

  return (
    <Card>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">
            {t(capability.label)}
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            {t("What you can do now")}
          </h2>
        </div>
        {capability.kind === "APPLICATION" && (
          <p className="text-sm text-muted-foreground">
            {t(
              "Apply below on this page. Submitted applications remain pending review; they do not create an active product.",
            )}
          </p>
        )}
        {capability.kind === "GUIDE" && (
          <p className="text-sm text-muted-foreground">
            {t(
              "This product is a guide only. Its application and account-opening service are not available in the demo yet.",
            )}
          </p>
        )}
        {capability.kind === "INVESTMENT" && (
          <p className="text-sm text-muted-foreground">
            {t(
              "Start a simulated order below. Suitability is checked first; the final review and confirmation use the secure workspace.",
            )}
          </p>
        )}
        {item.id === "foreign-exchange" && (
          <p className="text-sm text-muted-foreground">
            {t(
              "Exchange rates are illustrative. Currency exchange execution is not available yet.",
            )}
          </p>
        )}
        {capability.kind === "SERVICE" && item.id !== "foreign-exchange" && (
          <p className="text-sm text-muted-foreground">
            {t("Continue with the available demo banking service.")}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {investmentId && (
            <ActionLink
              authenticated={authenticated}
              href={`/app/wealth/products/${investmentId}`}
              label="Explore investment and suitability"
            />
          )}
          {serviceActions.map((action) => (
            <ActionLink
              key={action.href}
              authenticated={authenticated}
              {...action}
            />
          ))}
          {item.type === "CURRENT_ACCOUNT" && (
            <ActionLink
              authenticated={authenticated}
              href="/app/accounts"
              label="View your accounts"
            />
          )}
          {item.type === "MULTI_CURRENCY_ACCOUNT" && (
            <ActionLink
              authenticated={authenticated}
              href="/app/accounts"
              label="View your currency accounts"
            />
          )}
          {item.type === "SAVINGS_ACCOUNT" && (
            <ActionLink
              authenticated={authenticated}
              href="/app/accounts"
              label="View your accounts"
            />
          )}
          {["DEBIT_CARD", "CREDIT_CARD"].includes(item.type) && (
            <ActionLink
              authenticated={authenticated}
              href="/app/cards"
              label="View all your cards"
            />
          )}
          {["PERSONAL_LOAN", "MORTGAGE", "OVERDRAFT"].includes(item.type) && (
            <ActionLink
              authenticated={authenticated}
              href="/app/applications"
              label="Track your applications"
            />
          )}
          {item.type === "INSURANCE_PRODUCT" && (
            <ActionLink
              authenticated={authenticated}
              href="/app/applications"
              label="Track your applications"
            />
          )}
          {investmentId && (
            <ActionLink
              authenticated={authenticated}
              href="/app/wealth"
              label="View portfolio and orders"
            />
          )}
        </div>
        {session.isPending && (
          <p role="status" className="text-sm">
            {t("Checking your session…")}
          </p>
        )}
        {session.isError && (
          <p className="text-sm text-muted-foreground">
            {t("Sign in to view your existing products.")}
          </p>
        )}
        {authenticated && ["DEBIT_CARD", "CREDIT_CARD"].includes(item.type) && (
          <p className="text-sm font-medium">
            {t(
              "Your existing demo cards are separate from pending applications.",
            )}
          </p>
        )}
        {authenticated &&
          [
            "CURRENT_ACCOUNT",
            "SAVINGS_ACCOUNT",
            "MULTI_CURRENCY_ACCOUNT",
          ].includes(item.type) && <ExistingAccounts type={item.type} />}
        {authenticated && ["DEBIT_CARD", "CREDIT_CARD"].includes(item.type) && (
          <ExistingCards />
        )}
        {authenticated && investmentId && (
          <ExistingInvestment productId={investmentId} />
        )}
      </CardContent>
    </Card>
  );
}

export function SupportActions({ slug }: { slug: string }) {
  const { t } = useLocale();
  const actions = supportActions[slug] ?? [];
  const session = useQuery(sessionOptions);
  if (!actions.length) return null;
  return (
    <section className="rounded-xl border bg-secondary/40 p-6">
      <h2 className="text-xl font-semibold">
        {t("Use this in your demo banking")}
      </h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {actions.map((action) => (
          <ActionLink
            key={action.href}
            {...action}
            authenticated={!session.isError && !!session.data?.authenticated}
          />
        ))}
      </div>
    </section>
  );
}
