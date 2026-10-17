import type { components } from "@/generated/public-api";
import { provenance } from "./metadata";
export const catalog: components["schemas"]["PublicCatalogItemDetail"][] = (
  [
    {
      id: "everyday-account",
      slug: "everyday-account",
      category: "BANKING",
      type: "CURRENT_ACCOUNT",
      title: "Everyday Account",
      shortDescription:
        "An everyday CNY account for receiving money and making payments.",
      description:
        "An everyday CNY account for receiving money and making payments. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Access funds on demand",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Access funds on demand",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Account fee",
          value: "CNY 0 per month",
          conditions: "No minimum balance in this illustration.",
        },
      ],
      tags: ["banking", "current account", "everyday account"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "No minimum balance in this illustration.",
      ],
      relatedItemIds: ["flexible-savings", "time-deposit"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
      supportedCurrencies: ["CNY"],
    },
    {
      id: "flexible-savings",
      slug: "flexible-savings",
      category: "BANKING",
      type: "SAVINGS_ACCOUNT",
      title: "Flexible Savings",
      shortDescription:
        "Set money aside with flexible access and an illustrative savings rate.",
      description:
        "Set money aside with flexible access and an illustrative savings rate. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Separate savings from daily spending",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Separate savings from daily spending",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Account fee",
          value: "CNY 0 per month",
          conditions: "Illustrative interest is variable and not guaranteed.",
        },
      ],
      tags: ["banking", "savings account", "flexible savings"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Illustrative interest is variable and not guaranteed.",
      ],
      relatedItemIds: ["everyday-account", "time-deposit"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
      supportedCurrencies: ["CNY"],
    },
    {
      id: "time-deposit",
      slug: "time-deposit",
      category: "BANKING",
      type: "TIME_DEPOSIT",
      title: "Time Deposit",
      shortDescription:
        "Explore setting aside funds for a fixed illustrative term.",
      description:
        "Open a 12-month simulated CNY deposit using funds already held in your demo account. No real bank product is offered.",
      highlights: [
        "Choose a 12-month example term",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Choose a 12-month example term",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: [
          "Authenticated customers can open a 12-month demo deposit from an eligible CNY account.",
        ],
      },
      fees: [
        {
          label: "Early withdrawal",
          value: "Interest may be reduced",
          conditions:
            "Early withdrawal terms would be confirmed before a real agreement.",
        },
      ],
      tags: ["banking", "time deposit", "time deposit"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Early withdrawal terms would be confirmed before a real agreement.",
      ],
      relatedItemIds: ["everyday-account", "flexible-savings"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
      supportedCurrencies: ["CNY"],
    },
    {
      id: "global-currency-account",
      slug: "global-currency-account",
      category: "BANKING",
      type: "MULTI_CURRENCY_ACCOUNT",
      title: "Global Currency Account",
      shortDescription:
        "Understand holding CNY and USD in separate currency balances.",
      description:
        "Open separate zero-balance simulated accounts for supported foreign currencies. No exchange or funding is available yet.",
      highlights: [
        "View balances in their original currency",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "View balances in their original currency",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: [
          "Authenticated customers can open one zero-balance demo account per supported foreign currency.",
        ],
      },
      fees: [
        {
          label: "FX markup",
          value: "0.50% example",
          conditions: "Currency conversion involves exchange-rate risk.",
        },
      ],
      tags: ["banking", "multi currency account", "global currency account"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Currency conversion involves exchange-rate risk.",
      ],
      relatedItemIds: ["everyday-account", "flexible-savings"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
      supportedCurrencies: [
        "CNY",
        "USD",
        "JPY",
        "EUR",
        "GBP",
        "HKD",
        "AUD",
        "SGD",
      ],
    },
    {
      id: "payments-transfers",
      slug: "payments-transfers",
      category: "PAYMENTS_FX",
      type: "BANKING_SERVICE",
      title: "Payments & Transfers",
      shortDescription:
        "Learn how domestic bank transfers move funds between accounts.",
      description:
        "Learn how domestic bank transfers move funds between accounts. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Review recipient details before confirming",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Review recipient details before confirming",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: [
          "Authenticated customers can open one zero-balance demo account per supported foreign currency.",
        ],
      },
      fees: [
        {
          label: "Domestic transfer",
          value: "CNY 0 example",
          conditions: "No international transfer pricing is implied.",
        },
      ],
      tags: ["payments_fx", "banking service", "payments & transfers"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "No international transfer pricing is implied.",
      ],
      relatedItemIds: ["foreign-exchange"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
      supportedCurrencies: ["CNY"],
    },
    {
      id: "foreign-exchange",
      slug: "foreign-exchange",
      category: "PAYMENTS_FX",
      type: "BANKING_SERVICE",
      title: "Foreign Exchange",
      shortDescription:
        "Explore indicative exchange rates and conversion costs.",
      description:
        "Explore indicative exchange rates and conversion costs. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Understand rate and markup separately",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Understand rate and markup separately",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: [
          "Authenticated customers can open one zero-balance demo account per supported foreign currency.",
        ],
      },
      fees: [
        {
          label: "FX markup",
          value: "0.50% example",
          conditions: "Demo rates are not executable quotes.",
        },
      ],
      tags: ["payments_fx", "banking service", "foreign exchange"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Demo rates are not executable quotes.",
      ],
      relatedItemIds: ["payments-transfers"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
      supportedCurrencies: [
        "CNY",
        "USD",
        "JPY",
        "EUR",
        "GBP",
        "HKD",
        "AUD",
        "SGD",
      ],
    },
    {
      id: "everyday-debit-card",
      slug: "everyday-debit-card",
      category: "CARDS",
      type: "DEBIT_CARD",
      title: "Everyday Debit Card",
      shortDescription: "Explore a card connected to an everyday account.",
      description:
        "Explore a card connected to an everyday account. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Spend from available funds",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Spend from available funds",
        },
        {
          title: "FX / travel",
          description:
            "No borrowing facility; overseas conversion may incur an FX markup.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Annual fee",
          value: "CNY 0",
          conditions:
            "No borrowing facility; overseas conversion may incur an FX markup.",
        },
      ],
      tags: ["cards", "debit card", "everyday debit card"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "No borrowing facility; overseas conversion may incur an FX markup.",
      ],
      relatedItemIds: ["cashback-credit-card", "travel-credit-card"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "COMPARE",
          label: "Compare cards",
          route: "/cards/compare",
        },
      ],
    },
    {
      id: "cashback-credit-card",
      slug: "cashback-credit-card",
      category: "CARDS",
      type: "CREDIT_CARD",
      title: "Cashback Credit Card",
      shortDescription:
        "A simulated credit-card guide with everyday reward examples.",
      description:
        "A simulated credit-card guide with everyday reward examples. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Illustrative 1% cashback on eligible purchases",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Illustrative 1% cashback on eligible purchases",
        },
        {
          title: "FX / travel",
          description:
            "Currency conversion fees may apply to overseas purchases. No travel cover is included.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply. Credit and affordability assessment would be required; no approval is implied.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Annual fee",
          value: "CNY 120 example",
          conditions:
            "Reward exclusions and caps would apply; no rewards are issued in this demo.",
        },
      ],
      tags: ["cards", "credit card", "cashback credit card"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Reward exclusions and caps would apply; no rewards are issued in this demo.",
      ],
      relatedItemIds: ["everyday-debit-card", "travel-credit-card"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "COMPARE",
          label: "Compare cards",
          route: "/cards/compare",
        },
      ],
    },
    {
      id: "travel-credit-card",
      slug: "travel-credit-card",
      category: "CARDS",
      type: "CREDIT_CARD",
      title: "Travel Credit Card",
      shortDescription:
        "Compare a simulated card designed around travel features.",
      description:
        "Compare a simulated card designed around travel features. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Travel purchase information and overseas acceptance",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Travel purchase information and overseas acceptance",
        },
        {
          title: "FX / travel",
          description:
            "Illustrative 0.50% FX markup; travel cover is not included.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply. Credit and affordability assessment would be required; no approval is implied.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Annual fee",
          value: "CNY 300 example",
          conditions:
            "Illustrative 0.50% FX markup; travel cover is not included.",
        },
      ],
      tags: ["cards", "credit card", "travel credit card"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Illustrative 0.50% FX markup; travel cover is not included.",
      ],
      relatedItemIds: ["everyday-debit-card", "cashback-credit-card"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "COMPARE",
          label: "Compare cards",
          route: "/cards/compare",
        },
      ],
    },
    {
      id: "student-card",
      slug: "student-card",
      category: "CARDS",
      type: "DEBIT_CARD",
      title: "Student Card",
      shortDescription:
        "A simulated debit-card guide for students managing a first budget.",
      description:
        "A simulated debit-card guide for students managing a first budget. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Simple spending from available funds",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Simple spending from available funds",
        },
        {
          title: "FX / travel",
          description:
            "Overseas acceptance depends on the card network; conversion fees may apply. No travel cover is included.",
        },
      ],
      eligibility: {
        summary:
          "For students aged 18 or over; proof of student status would be required.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Annual fee",
          value: "CNY 0",
          conditions:
            "Student status would need verification; no credit facility.",
        },
      ],
      tags: ["cards", "debit card", "student card"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Student status would need verification; no credit facility.",
      ],
      relatedItemIds: ["everyday-debit-card", "cashback-credit-card"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "COMPARE",
          label: "Compare cards",
          route: "/cards/compare",
        },
      ],
    },
    {
      id: "personal-loan",
      slug: "personal-loan",
      category: "BORROWING",
      type: "PERSONAL_LOAN",
      title: "Personal Loan",
      shortDescription:
        "Learn about fixed-term borrowing and repayment commitments.",
      description:
        "Learn about fixed-term borrowing and repayment commitments. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Understand total borrowing costs",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Understand total borrowing costs",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply. Credit and affordability assessment would be required; no approval is implied.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Arrangement fee",
          value: "CNY 0 example",
          conditions:
            "Interest and affordability would require a separate assessment.",
        },
      ],
      tags: ["borrowing", "personal loan", "personal loan"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Interest and affordability would require a separate assessment.",
      ],
      relatedItemIds: ["home-mortgage", "overdraft"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "home-mortgage",
      slug: "home-mortgage",
      category: "BORROWING",
      type: "MORTGAGE",
      title: "Home Mortgage",
      shortDescription:
        "An introduction to secured home borrowing and deposit requirements.",
      description:
        "An introduction to secured home borrowing and deposit requirements. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Explore term, deposit and repayment considerations",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Explore term, deposit and repayment considerations",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply. Credit and affordability assessment would be required; no approval is implied.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Valuation fee",
          value: "Not quoted",
          conditions:
            "A property valuation and lending assessment would be required.",
        },
      ],
      tags: ["borrowing", "mortgage", "home mortgage"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "A property valuation and lending assessment would be required.",
      ],
      relatedItemIds: ["personal-loan", "overdraft"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "overdraft",
      slug: "overdraft",
      category: "BORROWING",
      type: "OVERDRAFT",
      title: "Overdraft",
      shortDescription:
        "Understand short-term borrowing linked to a current account.",
      description:
        "Understand short-term borrowing linked to a current account. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Review borrowing limits and repayment costs",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Review borrowing limits and repayment costs",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply. Credit and affordability assessment would be required; no approval is implied.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Facility fee",
          value: "Not quoted",
          conditions:
            "Borrowing is subject to assessment; this guide does not approve a limit.",
        },
      ],
      tags: ["borrowing", "overdraft", "overdraft"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Borrowing is subject to assessment; this guide does not approve a limit.",
      ],
      relatedItemIds: ["personal-loan", "home-mortgage"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "money-market-investing",
      slug: "money-market-investing",
      category: "INVESTMENTS",
      type: "INVESTMENT_PRODUCT",
      title: "Money Market Investing",
      shortDescription:
        "Learn about short-duration investments and liquidity considerations.",
      description:
        "Learn about short-duration investments and liquidity considerations. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Explore liquidity and credit risk",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Explore liquidity and credit risk",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Management fee",
          value: "0.20% per year example",
          conditions: "Capital and returns are not guaranteed.",
        },
      ],
      tags: ["investments", "investment product", "money market investing"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Capital and returns are not guaranteed.",
      ],
      relatedItemIds: ["bond-investing", "fund-investing"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "bond-investing",
      slug: "bond-investing",
      category: "INVESTMENTS",
      type: "INVESTMENT_PRODUCT",
      title: "Bond Investing",
      shortDescription:
        "Understand fixed-income exposure, credit risk and interest-rate sensitivity.",
      description:
        "Understand fixed-income exposure, credit risk and interest-rate sensitivity. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Compare issuer quality and maturity",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Compare issuer quality and maturity",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Management fee",
          value: "0.40% per year example",
          conditions: "Bond prices can fall when interest rates rise.",
        },
      ],
      tags: ["investments", "investment product", "bond investing"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Bond prices can fall when interest rates rise.",
      ],
      relatedItemIds: ["money-market-investing", "fund-investing"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "fund-investing",
      slug: "fund-investing",
      category: "INVESTMENTS",
      type: "INVESTMENT_PRODUCT",
      title: "Fund Investing",
      shortDescription: "Explore pooled investments and diversification.",
      description:
        "Explore pooled investments and diversification. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Review strategy, costs and risk together",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Review strategy, costs and risk together",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Management fee",
          value: "0.80% per year example",
          conditions: "Diversification cannot eliminate market losses.",
        },
      ],
      tags: ["investments", "investment product", "fund investing"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Diversification cannot eliminate market losses.",
      ],
      relatedItemIds: ["money-market-investing", "bond-investing"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "investment-basics",
      slug: "investment-basics",
      category: "INVESTMENTS",
      type: "BANKING_SERVICE",
      title: "Investment Basics",
      shortDescription: "Start with goals, time horizon and investment risk.",
      description:
        "Start with goals, time horizon and investment risk. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Understand risk before choosing a product",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Understand risk before choosing a product",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Guide fee",
          value: "CNY 0",
          conditions: "Educational content; no personal investment advice.",
        },
      ],
      tags: ["investments", "banking service", "investment basics"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Educational content; no personal investment advice.",
      ],
      relatedItemIds: ["money-market-investing", "bond-investing"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "life-insurance",
      slug: "life-insurance",
      category: "INSURANCE",
      type: "INSURANCE_PRODUCT",
      title: "Life Insurance",
      shortDescription:
        "Learn about life protection, beneficiaries and exclusions.",
      description:
        "Learn about life protection, beneficiaries and exclusions. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Understand the purpose of a protection policy",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Understand the purpose of a protection policy",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Premium",
          value: "Not quoted",
          conditions:
            "Cover, exclusions and underwriting would need separate confirmation.",
        },
      ],
      tags: ["insurance", "insurance product", "life insurance"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Cover, exclusions and underwriting would need separate confirmation.",
      ],
      relatedItemIds: ["health-insurance", "travel-insurance"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "health-insurance",
      slug: "health-insurance",
      category: "INSURANCE",
      type: "INSURANCE_PRODUCT",
      title: "Health Insurance",
      shortDescription:
        "Explore medical coverage, waiting periods and exclusions.",
      description:
        "Explore medical coverage, waiting periods and exclusions. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Review limits and eligible treatment",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Review limits and eligible treatment",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Premium",
          value: "Not quoted",
          conditions:
            "Pre-existing conditions may affect cover; no policy is issued.",
        },
      ],
      tags: ["insurance", "insurance product", "health insurance"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Pre-existing conditions may affect cover; no policy is issued.",
      ],
      relatedItemIds: ["life-insurance", "travel-insurance"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "travel-insurance",
      slug: "travel-insurance",
      category: "INSURANCE",
      type: "INSURANCE_PRODUCT",
      title: "Travel Insurance",
      shortDescription:
        "Learn about trip cancellation, medical and baggage protection.",
      description:
        "Learn about trip cancellation, medical and baggage protection. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Review destination and activity exclusions",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Review destination and activity exclusions",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Premium",
          value: "Not quoted",
          conditions:
            "Cover is subject to policy terms; no active protection is provided.",
        },
      ],
      tags: ["insurance", "insurance product", "travel insurance"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Cover is subject to policy terms; no active protection is provided.",
      ],
      relatedItemIds: ["life-insurance", "health-insurance"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
    {
      id: "home-insurance",
      slug: "home-insurance",
      category: "INSURANCE",
      type: "INSURANCE_PRODUCT",
      title: "Home Insurance",
      shortDescription: "Understand buildings and contents protection.",
      description:
        "Understand buildings and contents protection. This simulated guide explains example features and considerations. It is not an offer to open, borrow, insure or invest.",
      highlights: [
        "Review insured risks and excesses",
        "Read terms, fees and eligibility together",
      ],
      features: [
        {
          title: "Key benefit",
          description: "Review insured risks and excesses",
        },
        {
          title: "FX / travel",
          description: "Currency and jurisdiction restrictions may apply.",
        },
      ],
      eligibility: {
        summary:
          "For adults aged 18 or over; illustrative residency and identity requirements would apply.",
        requirements: ["Information only; no application is accepted."],
      },
      fees: [
        {
          label: "Premium",
          value: "Not quoted",
          conditions: "Property assessment and policy exclusions would apply.",
        },
      ],
      tags: ["insurance", "insurance product", "home insurance"],
      disclaimers: [
        "DEMO / SIMULATED PRODUCT INFORMATION",
        "No real product is available to purchase through this website.",
        "Property assessment and policy exclusions would apply.",
      ],
      relatedItemIds: ["life-insurance", "health-insurance"],
      cta: [
        {
          type: "LEARN_MORE",
          label: "Read support guides",
          route: "/support",
        },
        {
          type: "SIGN_IN",
          label: "Sign in to demo",
          route: "/login",
        },
      ],
    },
  ] satisfies Omit<
    components["schemas"]["PublicCatalogItemDetail"],
    "environment" | "lastUpdatedAt"
  >[]
).map((item) => ({
  ...item,
  ...provenance,
  eligibility:
    item.type === "SAVINGS_ACCOUNT" || item.type === "INSURANCE_PRODUCT"
      ? {
          ...item.eligibility,
          requirements: [
            "Apply on this page after signing in. Applications are subject to review.",
          ],
        }
      : item.type === "MORTGAGE" || item.type === "OVERDRAFT"
        ? {
            ...item.eligibility,
            requirements: [
              "Apply on this page after signing in. This request is stored for review and does not approve credit.",
            ],
          }
        : item.type === "INVESTMENT_PRODUCT"
          ? {
              ...item.eligibility,
              requirements: [
                "Check suitability and review a simulated investment order on this page before confirming.",
              ],
            }
          : item.eligibility,
}));
