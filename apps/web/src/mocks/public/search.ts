import type { components } from "@/generated/public-api";
import { catalog } from "./catalog";
import { articles } from "./support";
import { offers } from "./offers";
import { provenance } from "./metadata";
export const terms = (text: string) =>
  text.toLowerCase().trim().split(/\s+/).filter(Boolean);
export const matches = (text: string, query: string) =>
  terms(query).every((term) => text.toLowerCase().includes(term));
export function searchPublic(
  query: string,
): components["schemas"]["PublicSearch"] {
  const candidates: components["schemas"]["PublicSearchResult"][] = [
    ...catalog.map((item) => ({
      ...provenance,
      id: item.id,
      type: "CATALOG_ITEM" as const,
      title: item.title,
      summary: item.shortDescription,
      route: `/products/${item.slug}`,
      matchedTerms: [],
    })),
    ...articles.map((item) => ({
      ...provenance,
      id: item.id,
      type: "SUPPORT_ARTICLE" as const,
      title: item.title,
      summary: item.summary,
      route: `/support/${item.slug}`,
      matchedTerms: [],
    })),
    ...offers.map((item) => ({
      ...provenance,
      id: item.id,
      type: "OFFER" as const,
      title: item.title,
      summary: item.summary,
      route: `/offers#${item.id}`,
      matchedTerms: [],
    })),
  ];
  return {
    ...provenance,
    query,
    items: query.trim()
      ? candidates
          .filter((item) => matches(`${item.title} ${item.summary}`, query))
          .map((item) => ({ ...item, matchedTerms: terms(query) }))
      : [],
  };
}
