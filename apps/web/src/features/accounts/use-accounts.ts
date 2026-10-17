"use client";
import { useQuery } from "@tanstack/react-query";
import { getAccount, getAccounts } from "@/lib/api/accounts";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: ({ signal }) => getAccounts(signal),
    staleTime: 60_000,
    retry: false,
  });
}
export function useAccount(id: string) {
  return useQuery({
    queryKey: ["accounts", id],
    queryFn: ({ signal }) => getAccount(id, signal),
    staleTime: 60_000,
    retry: false,
  });
}
