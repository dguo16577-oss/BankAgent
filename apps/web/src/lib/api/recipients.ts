import type { components } from "@/generated/customer-api";
import { apiGet, apiPost } from "./client";
export type RecipientIntent = components["schemas"]["RecipientActionIntent"];
export type PrepareRecipient =
  components["schemas"]["PrepareRecipientActionRequest"];
export type Recipient = components["schemas"]["RecipientSummary"];
export const getRecipient = (id: string, signal?: AbortSignal) =>
  apiGet<Recipient>(`/customer/recipients/${encodeURIComponent(id)}`, signal);
export const prepareRecipient = (body: PrepareRecipient) =>
  apiPost<RecipientIntent>("/customer/recipient-action-intents", body);
export const executeRecipient = (
  intent: RecipientIntent,
  key: string,
  actionAuthorizationId?: string,
) =>
  apiPost<Recipient>(
    intent.actionType === "CREATE"
      ? "/customer/recipients"
      : "/customer/recipient-actions",
    {
      intentId: intent.id,
      intentHash: intent.intentHash,
      actionAuthorizationId,
    },
    { "Idempotency-Key": key },
  );
