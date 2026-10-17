import type { components, paths } from "@/generated/public-api";
import { apiGet } from "./client";
export type PublicHome = components["schemas"]["PublicHome"];
export type PublicNavigation = components["schemas"]["PublicNavigation"];
export type CatalogItem = components["schemas"]["PublicCatalogItemDetail"];
export type CatalogFilters = NonNullable<
  paths["/public/catalog"]["get"]["parameters"]["query"]
>;
export type SupportFilters = NonNullable<
  paths["/public/support/articles"]["get"]["parameters"]["query"]
>;
const query = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  return p.size ? `?${p}` : "";
};
export const getPublicHome = (signal?: AbortSignal) =>
  apiGet<PublicHome>("/public/home", signal);
export const getPublicNavigation = (signal?: AbortSignal) =>
  apiGet<PublicNavigation>("/public/navigation", signal);
export const getCatalog = (
  filters: CatalogFilters = {},
  signal?: AbortSignal,
) =>
  apiGet<components["schemas"]["PublicCatalog"]>(
    `/public/catalog${query(filters)}`,
    signal,
  );
export const getCatalogItem = (slug: string, signal?: AbortSignal) =>
  apiGet<CatalogItem>(`/public/catalog/${encodeURIComponent(slug)}`, signal);
export const getArticles = (
  filters: SupportFilters = {},
  signal?: AbortSignal,
) =>
  apiGet<components["schemas"]["SupportArticles"]>(
    `/public/support/articles${query(filters)}`,
    signal,
  );
export const getArticle = (slug: string, signal?: AbortSignal) =>
  apiGet<components["schemas"]["SupportArticleDetail"]>(
    `/public/support/articles/${encodeURIComponent(slug)}`,
    signal,
  );
export const getRates = (signal?: AbortSignal) =>
  apiGet<components["schemas"]["PublicRates"]>("/public/rates", signal);
export const getOffers = (signal?: AbortSignal) =>
  apiGet<components["schemas"]["PublicOffers"]>("/public/offers", signal);
export const searchPublic = (q: string, signal?: AbortSignal) =>
  apiGet<components["schemas"]["PublicSearch"]>(
    `/public/search${query({ q })}`,
    signal,
  );
