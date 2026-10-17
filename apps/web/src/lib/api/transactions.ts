import type { components, paths } from "@/generated/customer-api";
import { apiGet } from "./client";

export type TransactionQuery = NonNullable<
  paths["/customer/transactions"]["get"]["parameters"]["query"]
>;
export type TransactionFilters = Omit<TransactionQuery, "cursor" | "limit">;
export type TransactionSummary = components["schemas"]["TransactionSummary"];
export type TransactionDetail = components["schemas"]["TransactionDetail"];
export type TransactionPage = components["schemas"]["TransactionPage"];
export function getTransactions(query: TransactionQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return apiGet<TransactionPage>(`/customer/transactions?${params}`, signal);
}
export const getTransaction = (id: string, signal?: AbortSignal) =>
  apiGet<TransactionDetail>(
    `/customer/transactions/${encodeURIComponent(id)}`,
    signal,
  );
