"use client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getTransaction,
  getTransactions,
  type TransactionFilters,
} from "@/lib/api/transactions";

export function useTransactions(filters: TransactionFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["transactions", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getTransactions({ ...filters, cursor: pageParam, limit: 10 }, signal),
    getNextPageParam: (page) =>
      page.hasMore ? (page.nextCursor ?? undefined) : undefined,
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}
export function useTransaction(id: string) {
  return useQuery({
    queryKey: ["transaction", id],
    queryFn: ({ signal }) => getTransaction(id, signal),
    retry: false,
    staleTime: 60_000,
  });
}
