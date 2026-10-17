"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRecipient,
  prepareRecipient,
  executeRecipient,
  type RecipientIntent,
} from "@/lib/api/recipients";
export function useRecipient(id: string) {
  return useQuery({
    queryKey: ["recipients", "detail", id],
    queryFn: ({ signal }) => getRecipient(id, signal),
    retry: false,
  });
}
export function useRecipientActions() {
  const client = useQueryClient();
  const prepare = useMutation({ mutationFn: prepareRecipient, retry: false });
  const execute = useMutation({
    mutationFn: ({
      intent,
      key,
      actionAuthorizationId,
    }: {
      intent: RecipientIntent;
      key: string;
      actionAuthorizationId?: string;
    }) => executeRecipient(intent, key, actionAuthorizationId),
    retry: false,
    onSuccess: async () => {
      await Promise.all(
        ["recipients", "transfer-intents"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  return { prepare, execute };
}
