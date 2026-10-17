"use client";
import { useQuery, useQueries } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import {
  getPublicHome,
  getPublicNavigation,
  getCatalog,
  getCatalogItem,
  getArticles,
  getArticle,
  getRates,
  getOffers,
  searchPublic,
  type CatalogFilters,
  type SupportFilters,
} from "@/lib/api/public";
const options = {
  retry: false,
  staleTime: 300_000,
  // Recover visible public pages after a backend restart. Stop polling on success
  // and do not repeat permanent errors such as missing products or invalid queries.
  refetchInterval: (query: { state: { error: Error | null } }) => {
    const error = query.state.error;
    return error instanceof ApiError &&
      (error.kind === "network" || error.status >= 500)
      ? 15_000
      : false;
  },
};
export const usePublicHome = () =>
  useQuery({
    queryKey: ["public", "home"],
    queryFn: ({ signal }) => getPublicHome(signal),
    ...options,
  });
export const usePublicNavigation = () =>
  useQuery({
    queryKey: ["public", "navigation"],
    queryFn: ({ signal }) => getPublicNavigation(signal),
    ...options,
  });
export const useCatalog = (filters: CatalogFilters = {}) =>
  useQuery({
    queryKey: ["public", "catalog", filters],
    queryFn: ({ signal }) => getCatalog(filters, signal),
    ...options,
  });
export const useCatalogItem = (slug: string) =>
  useQuery({
    queryKey: ["public", "product", slug],
    queryFn: ({ signal }) => getCatalogItem(slug, signal),
    ...options,
  });
export const useCatalogDetails = (slugs: string[]) =>
  useQueries({
    queries: slugs.map((slug) => ({
      queryKey: ["public", "product", slug],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getCatalogItem(slug, signal),
      ...options,
    })),
  });
export const useArticles = (filters: SupportFilters = {}) =>
  useQuery({
    queryKey: ["public", "articles", filters],
    queryFn: ({ signal }) => getArticles(filters, signal),
    ...options,
  });
export const useArticle = (slug: string) =>
  useQuery({
    queryKey: ["public", "article", slug],
    queryFn: ({ signal }) => getArticle(slug, signal),
    ...options,
  });
export const useRates = () =>
  useQuery({
    queryKey: ["public", "rates"],
    queryFn: ({ signal }) => getRates(signal),
    ...options,
  });
export const useOffers = () =>
  useQuery({
    queryKey: ["public", "offers"],
    queryFn: ({ signal }) => getOffers(signal),
    ...options,
  });
export const usePublicSearch = (q: string) =>
  useQuery({
    queryKey: ["public", "search", q],
    queryFn: ({ signal }) => searchPublic(q, signal),
    enabled: !!q.trim(),
    ...options,
  });
