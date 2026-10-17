import type { components, paths } from "@/generated/customer-api";
import { apiGet, apiPost } from "./client";
type S = components["schemas"];
export type SpendingQuery = NonNullable<
  paths["/customer/spending/summary"]["get"]["parameters"]["query"]
>;
export const getSpending = (query: SpendingQuery, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return apiGet<S["SpendingSummary"]>(
    `/customer/spending/summary?${params}`,
    signal,
  );
};
export const getRecurringPayments = (signal?: AbortSignal) =>
  apiGet<S["RecurringPaymentsResponse"]>(
    "/customer/recurring-payments",
    signal,
  );
export const getRecurringPayment = (id: string, signal?: AbortSignal) =>
  apiGet<S["RecurringPaymentDetail"]>(
    `/customer/recurring-payments/${encodeURIComponent(id)}`,
    signal,
  );
export const prepareRecurringAction = (
  request: S["CreateRecurringPaymentActionIntentRequest"],
) =>
  apiPost<S["RecurringPaymentActionIntent"]>(
    "/customer/recurring-payment-action-intents",
    request,
  );
export const getRecurringIntent = (id: string, signal?: AbortSignal) =>
  apiGet<S["RecurringPaymentActionIntent"]>(
    `/customer/recurring-payment-action-intents/${encodeURIComponent(id)}`,
    signal,
  );
export const executeRecurringAction = (
  request: S["ExecuteRecurringPaymentActionRequest"],
  key: string,
) =>
  apiPost<S["RecurringPaymentActionReceipt"]>(
    "/customer/recurring-payment-actions",
    request,
    { "Idempotency-Key": key },
  );
export const getRecurringAction = (id: string, signal?: AbortSignal) =>
  apiGet<S["RecurringPaymentActionReceipt"]>(
    `/customer/recurring-payment-actions/${encodeURIComponent(id)}`,
    signal,
  );
