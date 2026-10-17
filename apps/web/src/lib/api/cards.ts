import type { components } from "@/generated/customer-api";
import { apiGet, apiPost } from "./client";
type Schema = components["schemas"];
export type CardSummary = Schema["CardSummary"];
export type CardDetail = Schema["CardDetail"];
export type CardControls = Schema["CardControls"];
export type CardLimits = Schema["CardLimits"];
export type CardActionIntent = Schema["CardActionIntent"];
export type CardActionReceipt = Schema["CardActionReceipt"];
export type CreateCardActionRequest = Schema["CreateCardActionIntentRequest"];
export type ExecuteCardActionRequest = Schema["ExecuteCardActionRequest"];
export type CreditLimitIntent = Schema["CreditLimitIntent"];
export type CreditLimitApplication = Schema["CreditLimitApplication"];
export const getCards = (signal?: AbortSignal) =>
  apiGet<Schema["CardsResponse"]>("/customer/cards", signal);
export const getCard = (id: string, signal?: AbortSignal) =>
  apiGet<CardDetail>(`/customer/cards/${encodeURIComponent(id)}`, signal);
export const prepareCardAction = (request: CreateCardActionRequest) =>
  apiPost<CardActionIntent>("/customer/card-action-intents", request);
export const getCardIntent = (id: string, signal?: AbortSignal) =>
  apiGet<CardActionIntent>(
    `/customer/card-action-intents/${encodeURIComponent(id)}`,
    signal,
  );
export const executeCardAction = (
  request: ExecuteCardActionRequest,
  key: string,
) =>
  apiPost<CardActionReceipt>("/customer/card-actions", request, {
    "Idempotency-Key": key,
  });
export const getCardAction = (id: string, signal?: AbortSignal) =>
  apiGet<CardActionReceipt>(
    `/customer/card-actions/${encodeURIComponent(id)}`,
    signal,
  );
export const prepareCreditLimit = (cardId: string, requestedLimit: string) =>
  apiPost<CreditLimitIntent>("/customer/credit-limit-intents", {
    cardId,
    requestedLimit,
  });
export const cancelCreditLimit = (intentId: string) =>
  apiPost<CreditLimitIntent>(
    `/customer/credit-limit-intents/${encodeURIComponent(intentId)}/cancel`,
    {},
  );
export const submitCreditLimit = (
  intent: CreditLimitIntent,
  actionAuthorizationId: string,
) =>
  apiPost<CreditLimitApplication>(
    "/customer/credit-limit-applications",
    {
      intentId: intent.id,
      intentHash: intent.intentHash,
      actionAuthorizationId,
    },
    { "Idempotency-Key": `credit_limit_${intent.id}` },
  );
export const listCreditLimitApplications = (signal?: AbortSignal) =>
  apiGet<Schema["CreditLimitApplicationsResponse"]>(
    "/customer/credit-limit-applications",
    signal,
  );
