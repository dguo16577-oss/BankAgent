import type { components } from "@/generated/public-api";
import { provenance } from "./metadata";
export const offers: components["schemas"]["PublicOffer"][] = [
  {
    ...provenance,
    id: "savings-learning",
    title: "Build a savings habit",
    summary:
      "Explore the Flexible Savings guide and plan a regular savings routine.",
    category: "BANKING",
    validFrom: "2026-09-01T00:00:00+08:00",
    validUntil: "2026-12-31T23:59:59+08:00",
    termsSummary:
      "Demo educational campaign only. No cash reward, bonus rate or entitlement.",
    route: "/products/flexible-savings",
  },
  {
    ...provenance,
    id: "travel-learning",
    title: "Travel with a clearer plan",
    summary:
      "Compare travel card information and learn about overseas conversion costs.",
    category: "CARDS",
    validFrom: "2026-09-01T00:00:00+08:00",
    validUntil: "2026-12-31T23:59:59+08:00",
    termsSummary:
      "Simulated campaign. No discount, insurance cover or reward is issued.",
    route: "/products/travel-credit-card",
  },
];
