import type { components } from "@/generated/public-api";
import { applicationProductTypes } from "@/features/applications/product-types";

type CatalogItem = components["schemas"]["PublicCatalogItemSummary"];

const investmentProducts: Record<string, string> = {
  "money-market-investing": "product_cash",
  "bond-investing": "product_bond",
  "fund-investing": "product_balanced",
};

const serviceActions: Record<string, { label: string; href: string }[]> = {
  "payments-transfers": [
    { label: "Make a transfer", href: "/app/payments/transfers/new" },
    { label: "Manage scheduled payments", href: "/app/payments/scheduled" },
    {
      label: "View transfer history",
      href: "/app/transactions?type=BANK_TRANSFER",
    },
  ],
  "foreign-exchange": [
    { label: "View demo exchange rates", href: "/rates" },
    { label: "View your currency accounts", href: "/app/accounts" },
  ],
  "investment-basics": [
    { label: "Explore demo investments", href: "/app/wealth" },
  ],
};

export const supportActions: Record<string, { label: string; href: string }[]> =
  {
    "account-statements": [
      { label: "View your transactions", href: "/app/transactions" },
    ],
    "budgeting-basics": [
      { label: "View your spending analysis", href: "/app/spending" },
    ],
    "online-banking": [
      { label: "Open your banking workspace", href: "/app/overview" },
    ],
    "lost-card": [{ label: "Manage your card controls", href: "/app/cards" }],
    "pending-card-payments": [{ label: "View your cards", href: "/app/cards" }],
    "bank-transfers": [
      { label: "Make a transfer", href: "/app/payments/transfers/new" },
    ],
    "failed-transfer": [
      {
        label: "View transfer history",
        href: "/app/transactions?type=BANK_TRANSFER",
      },
    ],
    "balance-available": [
      { label: "View your accounts", href: "/app/accounts" },
    ],
    "recurring-payments": [
      { label: "Manage recurring payments", href: "/app/spending" },
    ],
    "investment-risk": [
      { label: "Explore demo investments", href: "/app/wealth" },
    ],
    "bond-risk": [{ label: "Explore demo investments", href: "/app/wealth" }],
    "exchange-rates": [{ label: "View demo exchange rates", href: "/rates" }],
  };

export function productCapability(item: Pick<CatalogItem, "id" | "type">) {
  if (["TIME_DEPOSIT", "MULTI_CURRENCY_ACCOUNT"].includes(item.type)) {
    return { label: "Account opening available", kind: "SERVICE" as const };
  }
  if (applicationProductTypes.includes(item.type)) {
    return { label: "Application available", kind: "APPLICATION" as const };
  }
  if (investmentProducts[item.id]) {
    return { label: "Demo investing available", kind: "INVESTMENT" as const };
  }
  if (item.id === "foreign-exchange") {
    return { label: "Rates only", kind: "SERVICE" as const };
  }
  if (serviceActions[item.id]) {
    return { label: "Service available", kind: "SERVICE" as const };
  }
  return { label: "Guide only", kind: "GUIDE" as const };
}

export function investmentProductId(id: string) {
  return investmentProducts[id];
}

export function productServiceActions(id: string) {
  return serviceActions[id] ?? [];
}
