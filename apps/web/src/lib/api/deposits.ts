import type { paths } from "@/generated/customer-api";
import { apiGet, apiPost } from "./client";

export type TimeDeposit =
  paths["/customer/time-deposits"]["get"]["responses"][200]["content"]["application/json"]["items"][number];
export type CurrencyAccount =
  paths["/customer/currency-accounts"]["post"]["responses"][201]["content"]["application/json"];
export type Currency =
  paths["/customer/currency-accounts"]["post"]["requestBody"]["content"]["application/json"]["currency"];

export function openCurrencyAccount(currency: Currency) {
  return apiPost<CurrencyAccount>("/customer/currency-accounts", { currency });
}

export function listTimeDeposits(signal?: AbortSignal) {
  return apiGet<{ items: TimeDeposit[] }>("/customer/time-deposits", signal);
}

export function openTimeDeposit(
  sourceAccountId: string,
  amount: string,
  password: string,
  key: string,
) {
  return apiPost<TimeDeposit>(
    "/customer/time-deposits",
    { sourceAccountId, amount, password, confirm: true },
    { "Idempotency-Key": key },
  );
}
