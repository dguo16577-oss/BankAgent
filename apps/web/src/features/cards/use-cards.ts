"use client";
import { refreshAfterConflict } from "@/lib/api/conflict";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCards,
  getCard,
  getCardIntent,
  getCardAction,
  prepareCardAction,
  executeCardAction,
  type ExecuteCardActionRequest,
} from "@/lib/api/cards";
export function useCards() {
  return useQuery({
    queryKey: ["cards"],
    queryFn: ({ signal }) => getCards(signal),
    retry: false,
  });
}
export function useCard(id: string) {
  return useQuery({
    queryKey: ["cards", id],
    queryFn: ({ signal }) => getCard(id, signal),
    retry: false,
  });
}
export function useCardIntent(id: string) {
  return useQuery({
    queryKey: ["card-intents", id],
    enabled: !!id,
    queryFn: ({ signal }) => getCardIntent(id, signal),
    retry: false,
    staleTime: 0,
  });
}
export function useCardAction(id: string) {
  return useQuery({
    queryKey: ["card-actions", id],
    queryFn: ({ signal }) => getCardAction(id, signal),
    retry: false,
  });
}
export function usePrepareCardAction() {
  return useMutation({ mutationFn: prepareCardAction, retry: false });
}
export function useExecuteCardAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      request,
      key,
    }: {
      request: ExecuteCardActionRequest;
      key: string;
    }) => executeCardAction(request, key),
    retry: false,
    onError: (error) =>
      refreshAfterConflict(client, error, [
        "cards",
        "overview",
        "card-intents",
      ]),
    onSettled: (_receipt, error, variables) => {
      if (
        !error ||
        (error instanceof Error &&
          "status" in error &&
          typeof error.status === "number" &&
          error.status >= 400 &&
          error.status < 500)
      )
        delete variables.request.actionAuthorizationId;
    },
    onSuccess: async (receipt) => {
      client.removeQueries({ queryKey: ["step-up"] });
      client.setQueryData(["card-actions", receipt.id], receipt);
      await Promise.all(
        ["cards", "overview", "card-intents"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}
