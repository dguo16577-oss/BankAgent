"use client";
import { refreshAfterConflict } from "@/lib/api/conflict";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createIntent,
  executeTransfer,
  getIntent,
  getRecipients,
  getTransfer,
  type ExecuteRequest,
} from "@/lib/api/payments";
export function useRecipients(search = "") {
  return useQuery({
    queryKey: ["recipients", search],
    queryFn: ({ signal }) => getRecipients(search, signal),
    retry: false,
  });
}
export function usePrepareTransfer() {
  return useMutation({ mutationFn: createIntent, retry: false });
}
export function useTransferIntent(id: string) {
  return useQuery({
    queryKey: ["transfer-intents", id],
    queryFn: ({ signal }) => getIntent(id, signal),
    retry: false,
    staleTime: 0,
  });
}
export function useTransferReceipt(id: string) {
  return useQuery({
    queryKey: ["transfers", id],
    queryFn: ({ signal }) => getTransfer(id, signal),
    retry: false,
  });
}
export function useExecuteTransfer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ request, key }: { request: ExecuteRequest; key: string }) =>
      executeTransfer(request, key),
    retry: false,
    onError: (error) =>
      refreshAfterConflict(client, error, [
        "accounts",
        "overview",
        "transfer-intents",
      ]),
    onSuccess: async (receipt) => {
      // Discard old cursor pages because a mutation creates a new snapshot.
      client.removeQueries({ queryKey: ["transactions"] });
      client.setQueryData(["transfers", receipt.id], receipt);
      await Promise.all(
        ["accounts", "overview", "transaction", "transfer-intents"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}
