import type { paths } from "@/generated/customer-api";
import { apiGet } from "./client";

export type AccountsResponse =
  paths["/customer/accounts"]["get"]["responses"][200]["content"]["application/json"];
export type AccountDetail =
  paths["/customer/accounts/{accountId}"]["get"]["responses"][200]["content"]["application/json"];
export const getAccounts = (signal?: AbortSignal) =>
  apiGet<AccountsResponse>("/customer/accounts", signal);
export const getAccount = (id: string, signal?: AbortSignal) =>
  apiGet<AccountDetail>(`/customer/accounts/${encodeURIComponent(id)}`, signal);
