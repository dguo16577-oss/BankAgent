"use client";
import { useQuery } from "@tanstack/react-query";
import { getOverview } from "@/lib/api/overview";

export function useOverview() {
  return useQuery({
    queryKey: ["overview"],
    queryFn: ({ signal }) => getOverview(signal),
    staleTime: 60_000,
    retry: false,
  });
}
