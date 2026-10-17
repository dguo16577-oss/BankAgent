"use client";
import { refreshAfterConflict } from "@/lib/api/conflict";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { components } from "@/generated/customer-api";
import {
  getSpending,
  getRecurringPayments,
  getRecurringPayment,
  getRecurringIntent,
  getRecurringAction,
  prepareRecurringAction,
  executeRecurringAction,
  type SpendingQuery,
} from "@/lib/api/spending";
export const useSpending = (query: SpendingQuery = {}) =>
  useQuery({
    queryKey: ["spending", query],
    queryFn: ({ signal }) => getSpending(query, signal),
    retry: false,
  });
export const useRecurringPayments = () =>
  useQuery({
    queryKey: ["recurring"],
    queryFn: ({ signal }) => getRecurringPayments(signal),
    retry: false,
  });
export const useRecurringPayment = (id: string) =>
  useQuery({
    queryKey: ["recurring", id],
    queryFn: ({ signal }) => getRecurringPayment(id, signal),
    retry: false,
  });
export const useRecurringIntent = (id: string) =>
  useQuery({
    queryKey: ["recurring-intents", id],
    queryFn: ({ signal }) => getRecurringIntent(id, signal),
    retry: false,
    staleTime: 0,
  });
export const useRecurringAction = (id: string) =>
  useQuery({
    queryKey: ["recurring-actions", id],
    queryFn: ({ signal }) => getRecurringAction(id, signal),
    retry: false,
  });
export const usePrepareRecurring = () =>
  useMutation({ mutationFn: prepareRecurringAction, retry: false });
export function useExecuteRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      request,
      key,
    }: {
      request: components["schemas"]["ExecuteRecurringPaymentActionRequest"];
      key: string;
    }) => executeRecurringAction(request, key),
    retry: false,
    onError: (error) =>
      refreshAfterConflict(client, error, [
        "recurring",
        "overview",
        "spending",
        "recurring-intents",
      ]),
    onSuccess: async (receipt) => {
      client.setQueryData(["recurring-actions", receipt.id], receipt);
      await Promise.all(
        ["recurring", "recurring-intents", "overview"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}
