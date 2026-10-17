import type { components } from "@/generated/public-api";
import { catalog } from "./catalog";
import { articles } from "./support";
import { offers } from "./offers";
import { rates } from "./rates";
import { provenance } from "./metadata";

// Read-only reference content, intentionally outside MockBankingStore.
const navigationSeed = {
  groups: [
    {
      id: "banking",
      label: "Banking",
      route: "/banking",
      description: "Everyday accounts and simple ways to manage your money.",
      sections: [
        {
          label: "Accounts",
          links: [
            {
              label: "Current Account",
              route: "/banking",
              description:
                "Explore current account information in the Aster demo.",
            },
            {
              label: "Savings",
              route: "/banking",
              description: "Explore savings information in the Aster demo.",
            },
            {
              label: "Time Deposit",
              route: "/banking",
              description:
                "Explore time deposit information in the Aster demo.",
            },
            {
              label: "Multi-currency Account",
              route: "/banking",
              description:
                "Explore multi-currency account information in the Aster demo.",
            },
          ],
        },
        {
          label: "Everyday Banking",
          links: [
            {
              label: "Payments & Transfers",
              route: "/banking#everyday",
              description:
                "Explore payments & transfers information in the Aster demo.",
            },
            {
              label: "Foreign Exchange",
              route: "/banking#everyday",
              description:
                "Explore foreign exchange information in the Aster demo.",
            },
            {
              label: "Statements",
              route: "/banking#everyday",
              description: "Explore statements information in the Aster demo.",
            },
            {
              label: "Budgeting",
              route: "/banking#everyday",
              description: "Explore budgeting information in the Aster demo.",
            },
          ],
        },
        {
          label: "Ways to bank",
          links: [
            {
              label: "Online Banking",
              route: "/banking#ways-to-bank",
              description:
                "Explore online banking information in the Aster demo.",
            },
            {
              label: "Mobile Banking",
              route: "/banking#ways-to-bank",
              description:
                "Explore mobile banking information in the Aster demo.",
            },
          ],
        },
      ],
    },
    {
      id: "cards",
      label: "Cards & Borrowing",
      route: "/cards",
      description: "Explore cards and borrowing options for the way you live.",
      sections: [
        {
          label: "Cards",
          links: [
            {
              label: "Everyday Card",
              route: "/cards",
              description:
                "Explore everyday card information in the Aster demo.",
            },
            {
              label: "Cashback Card",
              route: "/cards",
              description:
                "Explore cashback card information in the Aster demo.",
            },
            {
              label: "Travel Card",
              route: "/cards",
              description: "Explore travel card information in the Aster demo.",
            },
            {
              label: "Compare Cards",
              route: "/cards",
              description:
                "Explore compare cards information in the Aster demo.",
            },
          ],
        },
        {
          label: "Borrowing",
          links: [
            {
              label: "Personal Loan",
              route: "/borrowing",
              description:
                "Explore personal loan information in the Aster demo.",
            },
            {
              label: "Mortgage",
              route: "/borrowing",
              description: "Explore mortgage information in the Aster demo.",
            },
            {
              label: "Overdraft",
              route: "/borrowing",
              description: "Explore overdraft information in the Aster demo.",
            },
          ],
        },
        {
          label: "Tools",
          links: [
            {
              label: "Loan Calculator",
              route: "/borrowing#tools",
              description:
                "Explore loan calculator information in the Aster demo.",
            },
            {
              label: "Mortgage Calculator",
              route: "/borrowing#tools",
              description:
                "Explore mortgage calculator information in the Aster demo.",
            },
            {
              label: "Fees",
              route: "/borrowing#tools",
              description: "Explore fees information in the Aster demo.",
            },
          ],
        },
      ],
    },
    {
      id: "investments",
      label: "Investments",
      route: "/investments",
      description: "Start with the basics. Explore choices at your own pace.",
      sections: [
        {
          label: "Products",
          links: [
            {
              label: "Money Market",
              route: "/investments",
              description:
                "Explore money market information in the Aster demo.",
            },
            {
              label: "Funds",
              route: "/investments",
              description: "Explore funds information in the Aster demo.",
            },
            {
              label: "Bonds",
              route: "/investments",
              description: "Explore bonds information in the Aster demo.",
            },
            {
              label: "Stocks",
              route: "/investments",
              description: "Explore stocks information in the Aster demo.",
            },
          ],
        },
        {
          label: "Planning",
          links: [
            {
              label: "Risk Profile",
              route: "/investments#planning",
              description:
                "Explore risk profile information in the Aster demo.",
            },
            {
              label: "Investment Basics",
              route: "/investments#planning",
              description:
                "Explore investment basics information in the Aster demo.",
            },
            {
              label: "Market Insights",
              route: "/investments#planning",
              description:
                "Explore market insights information in the Aster demo.",
            },
          ],
        },
      ],
    },
    {
      id: "insurance",
      label: "Insurance",
      route: "/insurance",
      description:
        "Information to help you plan for the people and things you value.",
      sections: [
        {
          label: "Explore protection",
          links: [
            {
              label: "Life",
              route: "/insurance",
              description: "Explore life information in the Aster demo.",
            },
            {
              label: "Health",
              route: "/insurance",
              description: "Explore health information in the Aster demo.",
            },
            {
              label: "Travel",
              route: "/insurance",
              description: "Explore travel information in the Aster demo.",
            },
            {
              label: "Home",
              route: "/insurance",
              description: "Explore home information in the Aster demo.",
            },
            {
              label: "Savings Insurance",
              route: "/insurance",
              description:
                "Explore savings insurance information in the Aster demo.",
            },
          ],
        },
      ],
    },
    {
      id: "insights",
      label: "Insights",
      route: "/insights",
      description: "Make sense of everyday financial decisions.",
      sections: [
        {
          label: "Learn with Aster",
          links: [
            {
              label: "Money basics",
              route: "/insights",
              description:
                "Explore money basics information in the Aster demo.",
            },
            {
              label: "Rates explained",
              route: "/insights",
              description:
                "Explore rates explained information in the Aster demo.",
            },
            {
              label: "Security guides",
              route: "/insights",
              description:
                "Explore security guides information in the Aster demo.",
            },
          ],
        },
      ],
    },
    {
      id: "offers",
      label: "Offers",
      route: "/offers",
      description: "Discover illustrative offers in our demo catalog.",
      sections: [
        {
          label: "Discover",
          links: [
            {
              label: "Everyday banking offers",
              route: "/offers",
              description:
                "Explore everyday banking offers information in the Aster demo.",
            },
            {
              label: "Travel ideas",
              route: "/offers",
              description:
                "Explore travel ideas information in the Aster demo.",
            },
            {
              label: "Learning events",
              route: "/offers",
              description:
                "Explore learning events information in the Aster demo.",
            },
          ],
        },
      ],
    },
    {
      id: "support",
      label: "Support",
      route: "/support",
      description: "Find useful guidance and learn how to bank safely.",
      sections: [
        {
          label: "How can we help?",
          links: [
            {
              label: "Help centre",
              route: "/support",
              description: "Explore help centre information in the Aster demo.",
            },
            {
              label: "Ways to contact us",
              route: "/support",
              description:
                "Explore ways to contact us information in the Aster demo.",
            },
            {
              label: "Security help",
              route: "/support",
              description:
                "Explore security help information in the Aster demo.",
            },
            {
              label: "Accessibility",
              route: "/support",
              description:
                "Explore accessibility information in the Aster demo.",
            },
          ],
        },
      ],
    },
  ],
  categories: [
    {
      route: "/banking",
      title: "Banking",
      description:
        "Make everyday money easier to understand. Explore accounts, savings, payments and ways to bank.",
      services: [],
    },
    {
      route: "/cards",
      title: "Cards",
      description:
        "Explore card products and compare everyday features. These are public product guides, not your personal cards.",
      services: [],
    },
    {
      route: "/borrowing",
      title: "Borrowing",
      description:
        "Understand borrowing choices, costs and repayment commitments. Product information only; no applications or calculators are available.",
      services: [],
    },
    {
      route: "/investments",
      title: "Investments",
      description:
        "Explore investment product information. This catalog is separate from your personal portfolio. Values can fall as well as rise.",
      services: [],
    },
    {
      route: "/insurance",
      title: "Insurance",
      description:
        "Explore protection categories and the questions to consider. Illustrative information only; no quotes or policies are issued.",
      services: [],
    },
    {
      route: "/insights",
      title: "Insights",
      description:
        "Clear introductions to money, rates and staying safe. Educational demo content, with no live market data.",
      services: [],
    },
    {
      route: "/offers",
      title: "Offers",
      description:
        "Browse a small selection of illustrative promotions. No live discounts, eligibility decisions or applications.",
      services: [],
    },
    {
      route: "/support",
      title: "Support",
      description:
        "Find your way around Aster and learn how to protect your information. This demo has no staffed support service.",
      services: [],
    },
  ],
};

const homeSeed = {
  hero: {
    eyebrow: "ASTER BANK · PERSONAL BANKING",
    title: "Everyday banking, built around you.",
    description: "Accounts, cards, payments, investing and financial guidance.",
    actions: [
      {
        label: "Explore banking",
        route: "/banking",
      },
      {
        label: "Ask Aster",
        route: "/ask",
      },
    ],
  },
  serviceCategories: [
    {
      id: "accounts",
      title: "Accounts & Savings",
      description: "A place for today, a plan for tomorrow.",
      route: "/banking",
      label: "Explore",
    },
    {
      id: "cards",
      title: "Cards",
      description: "Find a card for your everyday life.",
      route: "/cards",
      label: "Explore",
    },
    {
      id: "borrowing",
      title: "Borrowing",
      description: "Understand your options and costs.",
      route: "/borrowing",
      label: "Explore",
    },
    {
      id: "investments",
      title: "Investments",
      description: "Explore products and investment basics.",
      route: "/investments",
      label: "Explore",
    },
    {
      id: "insurance",
      title: "Insurance",
      description: "Plan for what matters to you.",
      route: "/insurance",
      label: "Explore",
    },
    {
      id: "payments",
      title: "Payments & FX",
      description: "Discover payments and currency services.",
      route: "/banking#everyday",
      label: "Explore",
    },
  ],
  securityNotice: {
    title: "Stay alert to scams",
    message:
      "Aster Bank will never ask you to reveal your password or security code.",
    link: {
      label: "Explore security guidance",
      route: "/support#security",
    },
  },
  environment: "DEMO",
};

export const catalogCard = (
  item: components["schemas"]["PublicCatalogItemSummary"],
): components["schemas"]["PublicContentCard"] => ({
  id: item.id,
  title: item.title,
  description: item.shortDescription,
  route: `/products/${item.slug}`,
  label: item.category.replaceAll("_", " "),
  lastUpdatedAt: item.lastUpdatedAt,
  environment: item.environment,
});
const articleCard = (
  item: components["schemas"]["SupportArticleSummary"],
): components["schemas"]["PublicContentCard"] => ({
  id: item.id,
  title: item.title,
  description: item.summary,
  route: `/support/${item.slug}`,
  label: item.category,
  lastUpdatedAt: item.lastUpdatedAt,
  environment: item.environment,
});
const offerCard = (
  item: components["schemas"]["PublicOffer"],
): components["schemas"]["PublicContentCard"] => ({
  id: item.id,
  title: item.title,
  description: item.summary,
  route: `/offers#${item.id}`,
  label: "DEMO CAMPAIGN",
  lastUpdatedAt: item.lastUpdatedAt,
  environment: item.environment,
});
const destinations: Record<string, string> = {
  "Current Account": "/products/everyday-account",
  Savings: "/products/flexible-savings",
  "Time Deposit": "/products/time-deposit",
  "Multi-currency Account": "/products/global-currency-account",
  "Payments & Transfers": "/products/payments-transfers",
  "Foreign Exchange": "/products/foreign-exchange",
  Statements: "/support/account-statements",
  Budgeting: "/support/budgeting-basics",
  "Online Banking": "/support/online-banking",
  "Mobile Banking": "/support/online-banking",
  "Everyday Card": "/products/everyday-debit-card",
  "Cashback Card": "/products/cashback-credit-card",
  "Travel Card": "/products/travel-credit-card",
  "Compare Cards": "/cards/compare",
  "Personal Loan": "/products/personal-loan",
  Mortgage: "/products/home-mortgage",
  Overdraft: "/products/overdraft",
  Fees: "/fees",
  "Money Market": "/products/money-market-investing",
  Funds: "/products/fund-investing",
  Bonds: "/products/bond-investing",
  "Risk Profile": "/support/investment-risk",
  "Investment Basics": "/products/investment-basics",
  "Market Insights": "/insights",
  Life: "/products/life-insurance",
  Health: "/products/health-insurance",
  Travel: "/products/travel-insurance",
  Home: "/products/home-insurance",
  "Life Insurance": "/products/life-insurance",
  "Health Insurance": "/products/health-insurance",
  "Travel Insurance": "/products/travel-insurance",
  "Home Insurance": "/products/home-insurance",
  "Money basics": "/support/budgeting-basics",
  "Rates explained": "/rates",
  "Security guides": "/support/recognise-phishing",
  "Security help": "/support/recognise-phishing",
  "Ways to contact us": "/support/contact-support",
  Accessibility: "/support/contact-support",
};
export const publicNavigation: components["schemas"]["PublicNavigation"] = {
  ...provenance,
  groups: navigationSeed.groups.map((group) => ({
    ...group,
    sections: group.sections
      .map((section) => ({
        ...section,
        links: section.links
          .filter(
            (link) =>
              ![
                "Loan Calculator",
                "Mortgage Calculator",
                "Stocks",
                "Savings Insurance",
              ].includes(link.label),
          )
          .map((link) => ({
            ...link,
            route: destinations[link.label] ?? link.route.split("#")[0],
          })),
      }))
      .filter((section) => section.links.length > 0),
  })),
  categories: navigationSeed.categories.map((category) => ({
    ...category,
    ...provenance,
    services:
      category.route === "/support" || category.route === "/insights"
        ? articles
            .filter(
              (a) =>
                category.route === "/support" || a.tags.includes("insight"),
            )
            .map(articleCard)
        : category.route === "/offers"
          ? offers.map(offerCard)
          : catalog
              .filter(
                (c) => c.category === category.route.slice(1).toUpperCase(),
              )
              .map(catalogCard),
  })),
};
// Add reference links rather than placeholder calculators or unsupported products.
publicNavigation.groups[0].sections.push({
  label: "Reference",
  links: [
    { label: "Rates", route: "/rates" },
    { label: "Fees", route: "/fees" },
  ],
});
export const publicHome: components["schemas"]["PublicHome"] = {
  ...homeSeed,
  ...provenance,
  serviceCategories: homeSeed.serviceCategories.map((item) => ({
    ...item,
    ...provenance,
    route: item.id.includes("payment")
      ? "/products/payments-transfers"
      : item.route,
  })),
  featuredServices: [
    "everyday-account",
    "flexible-savings",
    "travel-credit-card",
    "personal-loan",
    "bond-investing",
    "travel-insurance",
  ].map((id) => catalogCard(catalog.find((c) => c.id === id)!)),
  offers: offers.map(offerCard),
  insights: articles.filter((a) => a.tags.includes("insight")).map(articleCard),
  rates,
  securityNotice: {
    ...homeSeed.securityNotice,
    link: {
      ...homeSeed.securityNotice.link,
      route: "/support/recognise-phishing",
    },
  },
};
